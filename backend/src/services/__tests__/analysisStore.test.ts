import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnalysisStore } from '../analysisStore.js';
import { NotFoundError } from '../../utils/errors.js';
import type { RepositoryScan } from '../../types/repository.js';
import type { DependencyGraph } from '../../types/parsing.js';

/**
 * These tests exercise the store using an in-memory SQLite database. That
 * gives us the exact same code paths as production (better-sqlite3's
 * `:memory:` mode) without touching the disk.
 */

const makeScan = (owner = 'acme', name = 'widgets'): Omit<RepositoryScan, never> => ({
  name,
  owner,
  language: 'TypeScript',
  totalFiles: 12,
  totalFolders: 3,
  languages: [{ name: 'TypeScript', fileCount: 12, percent: 100 }],
  tree: {
    name,
    path: '',
    type: 'folder',
    children: [
      { name: 'src', path: 'src', type: 'folder', children: [
        { name: 'index.ts', path: 'src/index.ts', type: 'file', extension: 'ts', size: 42 },
      ] },
    ],
  },
  analyzedAt: '2026-08-09T00:00:00.000Z',
});

const makeGraph = (): DependencyGraph => ({
  nodes: [
    {
      filePath: 'src/index.ts',
      language: 'TypeScript',
      languageSupported: true,
      imports: [
        { source: './util', resolvedPath: 'src/util.ts', importedNames: ['x'], isTypeOnly: false, kind: 'import' },
      ],
      importedBy: [],
      symbols: [
        { id: 'src/index.ts#function:main@1', name: 'main', kind: 'function', location: { startLine: 1, endLine: 5, startColumn: 0, endColumn: 1 }, exported: true },
      ],
      parseError: null,
      skipped: false,
      skipReason: null,
      category: 'source',
      extension: 'ts',
      folder: 'src',
      symbolCount: 1,
    },
    {
      filePath: 'src/util.ts',
      language: 'TypeScript',
      languageSupported: true,
      imports: [],
      importedBy: ['src/index.ts'],
      symbols: [],
      parseError: null,
      skipped: false,
      skipReason: null,
      category: 'source',
      extension: 'ts',
      folder: 'src',
      symbolCount: 0,
    },
  ],
  edges: [{ from: 'src/index.ts', to: 'src/util.ts' }],
});

const summary = {
  totalNodes: 2,
  totalEdges: 1,
  filesParsed: 2,
  filesSkipped: 0,
  filesFailed: 0,
  circularDependencies: 0,
};

const openStore = (opts: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}) =>
  new AnalysisStore({
    dbPath: ':memory:',
    ttlMs: opts.ttlMs ?? 60_000,
    maxEntries: opts.maxEntries ?? 50,
    now: opts.now,
  });

describe('AnalysisStore (SQLite)', () => {
  it('round-trips a full analysis + graph', () => {
    const store = openStore();
    const scan = makeScan();
    const graph = makeGraph();

    const record = store.put({ analysis: { ...scan, dependencySummary: summary }, graph });

    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.analysis.id).toBe(record.id);
    expect(record.analysis.owner).toBe(scan.owner);
    expect(record.analysis.name).toBe(scan.name);
    expect(record.analysis.dependencySummary).toEqual(summary);

    // Now read it back through get() — deep equality is the whole point of persistence.
    const fetched = store.get(record.id);
    expect(fetched.analysis).toEqual(record.analysis);
    expect(fetched.graph).toEqual(graph);
    expect(fetched.storedAt).toBe(record.storedAt);

    store.close();
  });

  it('survives a store restart when using the same DB file', () => {
    // Fresh unique directory so leftover WAL/SHM files from a prior run cannot
    // lock us out (the failure mode of a fixed path under the repo).
    const dir = mkdtempSync(join(tmpdir(), 'stackscope-store-'));
    const path = join(dir, 'analyses.db');

    try {
      const first = new AnalysisStore({ dbPath: path, ttlMs: 60_000, maxEntries: 50 });
      const record = first.put({
        analysis: { ...makeScan(), dependencySummary: summary },
        graph: makeGraph(),
      });
      const id = record.id;
      first.close();

      const second = new AnalysisStore({ dbPath: path, ttlMs: 60_000, maxEntries: 50 });
      const revived = second.get(id);
      expect(revived.analysis.id).toBe(id);
      expect(revived.graph.edges).toEqual([{ from: 'src/index.ts', to: 'src/util.ts' }]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws NotFoundError for unknown ids', () => {
    const store = openStore();
    expect(() => store.get('00000000-0000-0000-0000-000000000000')).toThrow(NotFoundError);
    store.close();
  });

  it('expires entries past their TTL', () => {
    let clock = 1_000;
    const now = () => clock;
    const store = openStore({ ttlMs: 5_000, now });
    const record = store.put({ analysis: { ...makeScan(), dependencySummary: summary }, graph: makeGraph() });

    // Still valid at 1s later.
    clock += 1_000;
    expect(store.get(record.id).id).toBe(record.id);

    // At exactly ttlMs after storage, the entry should be treated as expired.
    clock = record.expiresAt;
    expect(() => store.get(record.id)).toThrow(NotFoundError);
    store.close();
  });

  it('evicts least-recently-accessed entries when the cap is reached', () => {
    let clock = 100;
    const store = openStore({ maxEntries: 3, now: () => clock });

    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const rec = store.put({ analysis: { ...makeScan('owner', `repo-${i}`), dependencySummary: summary }, graph: makeGraph() });
      ids.push(rec.id);
      clock += 10;
    }
    expect(store.size()).toBe(3);

    // Touch the first two to move them off the LRU tail.
    store.get(ids[0]!);
    clock += 10;
    store.get(ids[1]!);
    clock += 10;

    // Insert a fourth — the untouched ids[2] should be evicted.
    const inserted = store.put({ analysis: { ...makeScan('owner', 'repo-3'), dependencySummary: summary }, graph: makeGraph() });
    expect(store.size()).toBe(3);
    expect(() => store.get(ids[2]!)).toThrow(NotFoundError);
    // The most-recently-touched entries are still present.
    expect(store.get(ids[0]!).id).toBe(ids[0]);
    expect(store.get(ids[1]!).id).toBe(ids[1]);
    expect(store.get(inserted.id).id).toBe(inserted.id);
    store.close();
  });

  it('reports the number of live entries', () => {
    const store = openStore();
    expect(store.size()).toBe(0);
    store.put({ analysis: { ...makeScan(), dependencySummary: summary }, graph: makeGraph() });
    store.put({ analysis: { ...makeScan('other', 'thing'), dependencySummary: summary }, graph: makeGraph() });
    expect(store.size()).toBe(2);
    store.close();
  });

  it('preserves the tree structure exactly through JSON serialization', () => {
    const store = openStore();
    const scan = makeScan();
    const record = store.put({ analysis: { ...scan, dependencySummary: summary }, graph: makeGraph() });

    const fetched = store.get(record.id);
    // Deep equality is the strongest guarantee we care about here — the JSON
    // round-trip should be lossless for our DTOs (no Sets, Maps, or Dates).
    expect(fetched.analysis.tree).toEqual(scan.tree);
    expect(fetched.analysis.languages).toEqual(scan.languages);
    store.close();
  });
});
