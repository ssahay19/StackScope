import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  buildImpactPrompt,
  IMPACT_PROMPT_VERSION,
  impactCacheKey,
} from '../impactPrompt.js';
import { explainFileImpact } from '../impactExplainService.js';
import { setLlmProviderForTests } from '../summaryService.js';
import { computeImpact } from '../impactService.js';
import { analysisStore } from '../analysisService.js';
import { buildDependencyGraph } from '../parser/dependencyGraphService.js';
import type { LlmProvider } from '../llm/llmProvider.js';
import type { DependencyNode, ImportRef } from '../../types/parsing.js';
import { AiFailedError } from '../../utils/errors.js';

const nodeOf = (
  filePath: string,
  imports: Array<Partial<ImportRef> & { resolvedPath: string | null }>,
  symbols: DependencyNode['symbols'] = [],
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
  symbols,
  parseError: null,
  skipped: false,
  skipReason: null,
  category: 'source',
  extension: 'ts',
  folder: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '',
  symbolCount: symbols.length,
});

const seed = () => {
  const graph = buildDependencyGraph({
    nodes: [
      nodeOf('app/page.tsx', [{ resolvedPath: 'lib/utils.ts' }]),
      nodeOf(
        'lib/utils.ts',
        [],
        [
          {
            id: 'lib/utils.ts#function:cn@1',
            name: 'cn',
            kind: 'function',
            location: { startLine: 1, endLine: 3, startColumn: 0, endColumn: 1 },
            exported: true,
          },
        ],
      ),
      nodeOf('components/ui/button.tsx', [{ resolvedPath: 'lib/utils.ts' }]),
    ],
  });
  return analysisStore.put({
    analysis: {
      name: 'taxonomy',
      owner: 'shadcn-ui',
      language: 'TypeScript',
      totalFiles: 3,
      totalFolders: 3,
      languages: [{ name: 'TypeScript', fileCount: 3, percent: 100 }],
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
    readmeExcerpt: null,
  });
};

describe('buildImpactPrompt', () => {
  it('produces structured impact facts without source code', () => {
    const record = seed();
    const impact = computeImpact(record.graph, 'lib/utils.ts')!;
    const node = record.graph.nodes.find((n) => n.filePath === 'lib/utils.ts')!;
    const prompt = buildImpactPrompt({
      owner: 'shadcn-ui',
      name: 'taxonomy',
      filePath: 'lib/utils.ts',
      language: node.language,
      category: node.category,
      symbols: node.symbols,
      impact,
    });

    expect(prompt).toContain('Target file: lib/utils.ts');
    expect(prompt).toContain('Downstream (affected)');
    expect(prompt).toContain('app/page.tsx');
    expect(prompt).toContain('cn (function)');
    expect(prompt).not.toContain('function cn');
    expect(prompt.length).toBeLessThan(6_000);
  });
});

describe('explainFileImpact', () => {
  afterEach(() => {
    setLlmProviderForTests(undefined);
  });

  it('returns unavailable when AI is not configured', async () => {
    const record = seed();
    setLlmProviderForTests(null);
    const result = await explainFileImpact(record.id, 'lib/utils.ts');
    expect(result).toMatchObject({
      status: 'unavailable',
      code: 'AI_NOT_CONFIGURED',
    });
  });

  it('caches by (id, filePath, promptVersion) — provider called once', async () => {
    const record = seed();
    const generate = vi.fn(async () =>
      'This shared utility has a meaningful blast radius across components and app routes based on the impact facts.',
    );
    const provider: LlmProvider = { name: 'mock', generate };
    setLlmProviderForTests(provider);

    const first = await explainFileImpact(record.id, 'lib/utils.ts');
    const second = await explainFileImpact(record.id, 'lib/utils.ts');

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    if (first.status !== 'ok' || second.status !== 'ok') return;
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.text).toBe(first.text);
    expect(first.promptVersion).toBe(IMPACT_PROMPT_VERSION);
    expect(impactCacheKey('lib/utils.ts')).toBe(`${IMPACT_PROMPT_VERSION}:lib/utils.ts`);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('surfaces a clean error when the provider fails', async () => {
    const record = seed();
    setLlmProviderForTests({
      name: 'mock',
      generate: async () => {
        throw new AiFailedError('The AI provider returned an error.');
      },
    });

    await expect(explainFileImpact(record.id, 'lib/utils.ts')).rejects.toMatchObject({
      code: 'AI_FAILED',
    });
  });
});
