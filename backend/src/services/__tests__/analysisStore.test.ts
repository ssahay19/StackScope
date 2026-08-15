import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnalysisStore } from '../analysisStore.js';
import { NotFoundError } from '../../utils/errors.js';
import type { RepositoryScan } from '../../types/repository.js';
import type { DependencyGraph } from '../../types/parsing.js';

/**
 * SQLite AnalysisStore tests — run via Node's built-in test runner
 * (`node --import tsx --test`) so we avoid Vitest worker cold-start
 * timeouts with the better-sqlite3 native addon.
 *
 * Invoked from `npm test` after the vitest suites.
 */

const makeScan = (owner = 'acme', name = 'widgets'): RepositoryScan => ({
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
      {
        name: 'src',
        path: 'src',
        type: 'folder',
        children: [
          { name: 'index.ts', path: 'src/index.ts', type: 'file', extension: 'ts', size: 42 },
        ],
      },
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
        {
          source: './util',
          resolvedPath: 'src/util.ts',
          importedNames: ['x'],
          isTypeOnly: false,
          kind: 'import',
        },
      ],
      importedBy: [],
      symbols: [
        {
          id: 'src/index.ts#function:main@1',
          name: 'main',
          kind: 'function',
          location: { startLine: 1, endLine: 5, startColumn: 0, endColumn: 1 },
          exported: true,
        },
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

    assert.match(record.id, /^[0-9a-f-]{36}$/);
    assert.equal(record.analysis.id, record.id);
    assert.equal(record.analysis.owner, scan.owner);
    assert.equal(record.analysis.name, scan.name);
    assert.deepEqual(record.analysis.dependencySummary, summary);

    const fetched = store.get(record.id);
    assert.deepEqual(fetched.analysis, record.analysis);
    assert.deepEqual(fetched.graph, graph);
    assert.equal(fetched.storedAt, record.storedAt);

    store.close();
  });

  it('survives a store restart when using the same DB file', () => {
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
      assert.equal(revived.analysis.id, id);
      assert.deepEqual(revived.graph.edges, [{ from: 'src/index.ts', to: 'src/util.ts' }]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws NotFoundError for unknown ids', () => {
    const store = openStore();
    assert.throws(
      () => store.get('00000000-0000-0000-0000-000000000000'),
      (err: unknown) => err instanceof NotFoundError,
    );
    store.close();
  });

  it('expires entries past their TTL', () => {
    let clock = 1_000;
    const now = () => clock;
    const store = openStore({ ttlMs: 5_000, now });
    const record = store.put({
      analysis: { ...makeScan(), dependencySummary: summary },
      graph: makeGraph(),
    });

    clock += 1_000;
    assert.equal(store.get(record.id).id, record.id);

    clock = record.expiresAt;
    assert.throws(
      () => store.get(record.id),
      (err: unknown) => err instanceof NotFoundError,
    );
    store.close();
  });

  it('evicts least-recently-accessed entries when the cap is reached', () => {
    let clock = 100;
    const store = openStore({ maxEntries: 3, now: () => clock });

    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const rec = store.put({
        analysis: { ...makeScan('owner', `repo-${i}`), dependencySummary: summary },
        graph: makeGraph(),
      });
      ids.push(rec.id);
      clock += 10;
    }
    assert.equal(store.size(), 3);

    store.get(ids[0]!);
    clock += 10;
    store.get(ids[1]!);
    clock += 10;

    const inserted = store.put({
      analysis: { ...makeScan('owner', 'repo-3'), dependencySummary: summary },
      graph: makeGraph(),
    });
    assert.equal(store.size(), 3);
    assert.throws(
      () => store.get(ids[2]!),
      (err: unknown) => err instanceof NotFoundError,
    );
    assert.equal(store.get(ids[0]!).id, ids[0]);
    assert.equal(store.get(ids[1]!).id, ids[1]);
    assert.equal(store.get(inserted.id).id, inserted.id);
    store.close();
  });

  it('reports the number of live entries', () => {
    const store = openStore();
    assert.equal(store.size(), 0);
    store.put({ analysis: { ...makeScan(), dependencySummary: summary }, graph: makeGraph() });
    store.put({
      analysis: { ...makeScan('other', 'thing'), dependencySummary: summary },
      graph: makeGraph(),
    });
    assert.equal(store.size(), 2);
    store.close();
  });

  it('preserves the tree structure exactly through JSON serialization', () => {
    const store = openStore();
    const scan = makeScan();
    const record = store.put({
      analysis: { ...scan, dependencySummary: summary },
      graph: makeGraph(),
    });

    const fetched = store.get(record.id);
    assert.deepEqual(fetched.analysis.tree, scan.tree);
    assert.deepEqual(fetched.analysis.languages, scan.languages);
    store.close();
  });
});
