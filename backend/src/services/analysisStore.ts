import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database, { type Database as DatabaseType, type Statement } from 'better-sqlite3';
import type { RepositoryAnalysis } from '../types/repository.js';
import type { DependencyGraph } from '../types/parsing.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * analysisStore — Phase 4
 *
 * Persistent keyed store of completed analyses, backed by SQLite via
 * `better-sqlite3`. Behavior contract (identical to Phase 2's in-memory store):
 *
 *   - deterministic ids (UUID v4) returned to clients
 *   - TTL-based expiry (default 30 minutes)
 *   - hard entry cap with LRU eviction, so a busy server cannot grow the DB
 *     without bound
 *   - `put(...) → StoredAnalysis`
 *   - `get(id) → StoredAnalysis` — throws NotFoundError on miss/expiry
 *   - `size() → number`
 *
 * The class is deliberately kept as `AnalysisStore` (the original name) so
 * `analysisService` and the routes are unchanged.
 *
 * The full `StoredAnalysis` (analysis + graph) is serialized as a single JSON
 * blob per row. That trades a tiny amount of storage efficiency for a very
 * simple schema and zero object-relational mapping. Round-trip fidelity is
 * guaranteed because our DTOs are pure JSON (no Sets, Maps, Dates on the wire).
 */

export interface StoredAnalysis {
  id: string;
  analysis: RepositoryAnalysis;
  graph: DependencyGraph;
  storedAt: number;
  expiresAt: number;
  lastAccessedAt: number;
}

export interface AnalysisStoreOptions {
  /** Filesystem path to the SQLite file. Use `:memory:` for tests. */
  dbPath: string;
  ttlMs: number;
  maxEntries: number;
  /** Injected clock for tests. */
  now?: () => number;
}

interface Row {
  id: string;
  data: string;
  stored_at: number;
  expires_at: number;
  last_accessed_at: number;
}

const log = logger.child({ service: 'analysisStore' });

export class AnalysisStore {
  private readonly db: DatabaseType;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  private readonly stmtInsert: Statement;
  private readonly stmtSelect: Statement;
  private readonly stmtDelete: Statement;
  private readonly stmtDeleteExpired: Statement;
  private readonly stmtCount: Statement;
  private readonly stmtSelectVictims: Statement;
  private readonly stmtUpdateAccess: Statement;

  constructor(options: AnalysisStoreOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
    this.now = options.now ?? Date.now;

    const path = resolvePath(options.dbPath);
    if (path !== ':memory:') ensureDirectory(path);
    this.db = new Database(path);

    // WAL improves concurrent reader throughput and makes single-writer commits
    // faster. `synchronous = NORMAL` is the recommended pairing for WAL in
    // most Node.js deployments.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analyses (
        id                TEXT PRIMARY KEY,
        data              TEXT NOT NULL,
        stored_at         INTEGER NOT NULL,
        expires_at        INTEGER NOT NULL,
        last_accessed_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_analyses_expires_at ON analyses(expires_at);
      CREATE INDEX IF NOT EXISTS idx_analyses_last_accessed_at ON analyses(last_accessed_at);
    `);

    this.stmtInsert = this.db.prepare(`
      INSERT INTO analyses (id, data, stored_at, expires_at, last_accessed_at)
      VALUES (@id, @data, @stored_at, @expires_at, @last_accessed_at)
    `);
    this.stmtSelect = this.db.prepare(`SELECT * FROM analyses WHERE id = ?`);
    this.stmtDelete = this.db.prepare(`DELETE FROM analyses WHERE id = ?`);
    this.stmtDeleteExpired = this.db.prepare(`DELETE FROM analyses WHERE expires_at <= ?`);
    this.stmtCount = this.db.prepare(`SELECT COUNT(*) AS n FROM analyses`);
    this.stmtSelectVictims = this.db.prepare(`
      SELECT id FROM analyses ORDER BY last_accessed_at ASC LIMIT ?
    `);
    this.stmtUpdateAccess = this.db.prepare(`
      UPDATE analyses SET last_accessed_at = @ts WHERE id = @id
    `);

    log.info({ dbPath: path, ttlMs: this.ttlMs, maxEntries: this.maxEntries }, 'analysis store ready');
  }

  put(input: { analysis: Omit<RepositoryAnalysis, 'id'>; graph: DependencyGraph }): StoredAnalysis {
    const now = this.now();
    this.deleteExpired(now);

    const id = randomUUID();
    const analysisWithId: RepositoryAnalysis = { ...input.analysis, id };
    const record: StoredAnalysis = {
      id,
      analysis: analysisWithId,
      graph: input.graph,
      storedAt: now,
      expiresAt: now + this.ttlMs,
      lastAccessedAt: now,
    };

    // We only need the *payload* (analysis + graph) in the blob. Timestamps
    // live in dedicated columns so we can query them.
    const payload = JSON.stringify({ analysis: record.analysis, graph: record.graph });
    this.stmtInsert.run({
      id,
      data: payload,
      stored_at: record.storedAt,
      expires_at: record.expiresAt,
      last_accessed_at: record.lastAccessedAt,
    });

    this.enforceCap();
    return record;
  }

  get(id: string): StoredAnalysis {
    const row = this.stmtSelect.get(id) as Row | undefined;
    if (!row) throw new NotFoundError('Analysis not found or has expired.');

    const now = this.now();
    if (row.expires_at <= now) {
      this.stmtDelete.run(id);
      throw new NotFoundError('Analysis not found or has expired.');
    }

    this.stmtUpdateAccess.run({ ts: now, id });

    const parsed = JSON.parse(row.data) as { analysis: RepositoryAnalysis; graph: DependencyGraph };
    return {
      id,
      analysis: parsed.analysis,
      graph: parsed.graph,
      storedAt: row.stored_at,
      expiresAt: row.expires_at,
      lastAccessedAt: now,
    };
  }

  size(): number {
    const row = this.stmtCount.get() as { n: number };
    return row.n;
  }

  /** Close the underlying DB handle. Callable more than once safely. */
  close(): void {
    if (this.db.open) this.db.close();
  }

  private deleteExpired(now: number): void {
    this.stmtDeleteExpired.run(now);
  }

  private enforceCap(): void {
    const current = this.size();
    const excess = current - this.maxEntries;
    if (excess <= 0) return;
    const victims = this.stmtSelectVictims.all(excess) as Array<{ id: string }>;
    const del = this.db.transaction((rows: Array<{ id: string }>) => {
      for (const r of rows) this.stmtDelete.run(r.id);
    });
    del(victims);
  }
}

const resolvePath = (raw: string): string => {
  if (raw === ':memory:') return raw;
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
};

const ensureDirectory = (filePath: string): void => {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
};
