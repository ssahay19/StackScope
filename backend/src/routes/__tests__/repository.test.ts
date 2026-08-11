import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { analysisStore } from '../../services/analysisService.js';

/**
 * Route-level tests against the real Express app + the process-wide store.
 *
 * The store is SQLite-backed with `ANALYSIS_DB_PATH=:memory:` injected by
 * vitest.config.ts, so these never touch the filesystem.
 */

const app = createApp();

const seedAnalysis = () =>
  analysisStore.put({
    analysis: {
      name: 'widgets',
      owner: 'acme',
      language: 'TypeScript',
      totalFiles: 3,
      totalFolders: 1,
      languages: [{ name: 'TypeScript', fileCount: 3, percent: 100 }],
      tree: {
        name: 'widgets',
        path: '',
        type: 'folder',
        children: [
          {
            name: 'index.ts',
            path: 'index.ts',
            type: 'file',
            extension: 'ts',
            size: 100,
          },
        ],
      },
      analyzedAt: '2026-08-09T00:00:00.000Z',
      dependencySummary: {
        totalNodes: 1,
        totalEdges: 0,
        filesParsed: 1,
        filesSkipped: 0,
        filesFailed: 0,
        circularDependencies: 0,
      },
    },
    graph: {
      nodes: [
        {
          filePath: 'index.ts',
          language: 'TypeScript',
          languageSupported: true,
          imports: [],
          importedBy: [],
          symbols: [],
          parseError: null,
          skipped: false,
          skipReason: null,
          category: 'source',
          extension: 'ts',
          folder: '',
          symbolCount: 0,
        },
      ],
      edges: [],
    },
  });

describe('GET /api/repository/:id', () => {
  it('returns the full stored analysis when the id exists', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(record.id);
    expect(res.body.owner).toBe('acme');
    expect(res.body.name).toBe('widgets');
    expect(res.body.dependencySummary.totalNodes).toBe(1);
    expect(res.body.tree.children).toHaveLength(1);
    expect(res.body.languages).toHaveLength(1);
  });

  it('returns 404 with the uniform error shape when the id is unknown', async () => {
    const res = await request(app).get('/api/repository/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});

describe('GET /api/repository/:id/dependencies (regression)', () => {
  it('returns nodes + edges from the SQLite-backed store', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/dependencies`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(res.body.nodes[0].filePath).toBe('index.ts');
    expect(res.body.nodes[0].category).toBe('source');
    expect(res.body.edges).toEqual([]);
  });
});

describe('GET /api/repository/:id/file/* (regression)', () => {
  it('returns a single file node and includes Phase 3 metadata', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/file/index.ts`);
    expect(res.status).toBe(200);
    expect(res.body.filePath).toBe('index.ts');
    expect(res.body.category).toBe('source');
    expect(res.body.extension).toBe('ts');
    expect(res.body.folder).toBe('');
    expect(res.body.symbolCount).toBe(0);
  });

  it('returns 404 for an unknown file inside a real analysis', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/file/does/not/exist.ts`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
