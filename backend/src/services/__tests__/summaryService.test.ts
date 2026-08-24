import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  buildArchitecturePrompt,
  estimatePromptChars,
  PROMPT_VERSION,
} from '../summaryPrompt.js';
import {
  setLlmProviderForTests,
  summarizeRepository,
} from '../summaryService.js';
import { analysisStore } from '../analysisService.js';
import { computeArchitectureInsights } from '../architectureInsightsService.js';
import { buildDependencyGraph } from '../parser/dependencyGraphService.js';
import type { LlmProvider } from '../llm/llmProvider.js';
import type { DependencyNode, ImportRef } from '../../types/parsing.js';
import { AiFailedError, AiRateLimitedError } from '../../utils/errors.js';

const nodeOf = (
  filePath: string,
  imports: Array<Partial<ImportRef> & { resolvedPath: string | null }>,
): DependencyNode => ({
  filePath,
  language: 'TypeScript',
  languageSupported: true,
  imports: imports.map((imp) => ({
    source: imp.source ?? imp.resolvedPath ?? '',
    resolvedPath: imp.resolvedPath,
    importedNames: [],
    isTypeOnly: false,
    kind: 'import',
  })),
  importedBy: [],
  symbols: [],
  parseError: null,
  skipped: false,
  skipReason: null,
  category: 'source',
  extension: 'ts',
  folder: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '',
  symbolCount: 0,
});

const seedAnalysis = (readmeExcerpt: string | null = 'Taxonomy is a Next.js app.') => {
  const nodes = [
    nodeOf('app/page.tsx', [{ resolvedPath: 'lib/utils.ts' }]),
    nodeOf('lib/utils.ts', []),
    nodeOf('components/ui/button.tsx', [{ resolvedPath: 'lib/utils.ts' }]),
  ];
  const graph = buildDependencyGraph({ nodes });
  return analysisStore.put({
    analysis: {
      name: 'taxonomy',
      owner: 'shadcn-ui',
      language: 'TypeScript',
      totalFiles: 3,
      totalFolders: 3,
      languages: [
        { name: 'TypeScript', fileCount: 2, percent: 66.7 },
        { name: 'TSX', fileCount: 1, percent: 33.3 },
      ],
      tree: { name: 'taxonomy', path: '', type: 'folder', children: [] },
      analyzedAt: '2026-08-15T00:00:00.000Z',
      dependencySummary: {
        totalNodes: 3,
        totalEdges: 2,
        filesParsed: 3,
        filesSkipped: 0,
        filesFailed: 0,
        circularDependencies: 0,
      },
    },
    graph,
    readmeExcerpt,
  });
};

describe('buildArchitecturePrompt', () => {
  it('produces structured facts from insights (no source code dumps)', () => {
    const record = seedAnalysis();
    const insights = computeArchitectureInsights(record.graph);
    const prompt = buildArchitecturePrompt({
      owner: record.analysis.owner,
      name: record.analysis.name,
      primaryLanguage: record.analysis.language,
      languages: record.analysis.languages,
      insights,
      readmeExcerpt: record.readmeExcerpt,
    });

    expect(prompt).toContain('Repository: shadcn-ui/taxonomy');
    expect(prompt).toContain('Most depended-on files:');
    expect(prompt).toContain('lib/utils.ts');
    expect(prompt).toContain('Module groups by top-level folder');
    expect(prompt).toContain('README excerpt');
    expect(prompt).toContain('Taxonomy is a Next.js app.');
    expect(prompt).not.toContain('function ');
    expect(prompt).not.toContain('import ');
    expect(estimatePromptChars(prompt)).toBeLessThan(8_000);
  });
});

describe('summarizeRepository', () => {
  afterEach(() => {
    setLlmProviderForTests(undefined);
  });

  it('returns unavailable when no provider is configured', async () => {
    const record = seedAnalysis();
    setLlmProviderForTests(null);
    const result = await summarizeRepository(record.id);
    expect(result).toEqual({
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
      message: expect.stringContaining('LLM_API_KEY'),
    });
  });

  it('caches by (id, promptVersion) — provider called once', async () => {
    const record = seedAnalysis();
    const generate = vi.fn(async () =>
      'This is a clear architecture overview of the taxonomy repository based on the dependency graph facts provided above.',
    );
    const provider: LlmProvider = { name: 'mock', generate };
    setLlmProviderForTests(provider);

    const first = await summarizeRepository(record.id);
    const second = await summarizeRepository(record.id);

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    if (first.status !== 'ok' || second.status !== 'ok') return;
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.text).toBe(first.text);
    expect(first.promptVersion).toBe(PROMPT_VERSION);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('surfaces a clean error when the provider fails', async () => {
    const record = seedAnalysis();
    setLlmProviderForTests({
      name: 'mock',
      generate: async () => {
        throw new AiFailedError('The AI provider returned an error.');
      },
    });

    await expect(summarizeRepository(record.id)).rejects.toMatchObject({
      code: 'AI_FAILED',
    });
  });

  it('surfaces rate-limit errors from the provider', async () => {
    const record = seedAnalysis();
    setLlmProviderForTests({
      name: 'mock',
      generate: async () => {
        throw new AiRateLimitedError();
      },
    });

    await expect(summarizeRepository(record.id)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
    });
  });
});
