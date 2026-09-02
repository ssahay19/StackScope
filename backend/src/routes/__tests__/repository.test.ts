import { describe, expect, it, vi } from 'vitest';
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

describe('GET /api/repository/:id/insights', () => {
  it('returns architecture insights derived from the stored graph', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/insights`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      totalFiles: 1,
      totalDependencies: 0,
      circularChainCount: 0,
      rootCount: 0,
      orphanCount: 1,
    });
    expect(res.body.orphans[0].filePath).toBe('index.ts');
    expect(Array.isArray(res.body.mostDependedOn)).toBe(true);
    expect(Array.isArray(res.body.circularChains)).toBe(true);
    expect(res.body.dependencyDepth).toEqual({ maxDepth: 0, deepestPath: [] });
  });

  it('returns 404 when the analysis id is unknown', async () => {
    const res = await request(app).get(
      '/api/repository/00000000-0000-0000-0000-000000000000/insights',
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/repository/:id/summary', () => {
  it('returns unavailable when AI is not configured', async () => {
    const { setLlmProviderForTests } = await import('../../services/summaryService.js');
    setLlmProviderForTests(null);
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/summary`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
    });
    setLlmProviderForTests(undefined);
  });

  it('returns cached summary on the second call (provider once)', async () => {
    const { setLlmProviderForTests } = await import('../../services/summaryService.js');
    const generate = vi.fn(async () =>
      'Cached architecture overview text that is long enough to pass validation checks.',
    );
    setLlmProviderForTests({ name: 'mock', generate });

    const record = seedAnalysis();
    const first = await request(app).get(`/api/repository/${record.id}/summary`);
    const second = await request(app).get(`/api/repository/${record.id}/summary`);

    expect(first.status).toBe(200);
    expect(first.body.status).toBe('ok');
    expect(first.body.cached).toBe(false);
    expect(second.body.cached).toBe(true);
    expect(second.body.text).toBe(first.body.text);
    expect(generate).toHaveBeenCalledTimes(1);

    setLlmProviderForTests(undefined);
  });

  it('returns a clean error when the provider fails', async () => {
    const { setLlmProviderForTests } = await import('../../services/summaryService.js');
    const { AiFailedError } = await import('../../utils/errors.js');
    setLlmProviderForTests({
      name: 'mock',
      generate: async () => {
        throw new AiFailedError('The AI provider returned an error.');
      },
    });

    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/summary`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('AI_FAILED');

    setLlmProviderForTests(undefined);
  });
});

describe('GET /api/repository/:id/impact/*', () => {
  it('returns impact for a known file', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/impact/index.ts`);
    expect(res.status).toBe(200);
    expect(res.body.filePath).toBe('index.ts');
    expect(res.body.downstream.total).toBe(0);
    expect(res.body.upstream.total).toBe(0);
  });

  it('returns 404 for an unknown file', async () => {
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/impact/missing.ts`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns unavailable for /explain when AI is not configured', async () => {
    const { setLlmProviderForTests } = await import('../../services/summaryService.js');
    setLlmProviderForTests(null);
    const record = seedAnalysis();
    const res = await request(app).get(`/api/repository/${record.id}/impact/index.ts/explain`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
    });
    setLlmProviderForTests(undefined);
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
