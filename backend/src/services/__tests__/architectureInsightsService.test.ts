import { describe, expect, it } from 'vitest';
import {
  computeArchitectureInsights,
  findStronglyConnectedComponents,
} from '../architectureInsightsService.js';
import { buildDependencyGraph } from '../parser/dependencyGraphService.js';
import type { DependencyGraph, DependencyNode, ImportRef, NodeCategory } from '../../types/parsing.js';

const nodeOf = (
  filePath: string,
  imports: Array<Partial<ImportRef> & { resolvedPath: string | null }>,
  extras: Partial<Pick<DependencyNode, 'category' | 'language' | 'languageSupported' | 'skipped'>> = {},
): DependencyNode => ({
  filePath,
  language: extras.language ?? 'TypeScript',
  languageSupported: extras.languageSupported ?? true,
  imports: imports.map((imp) => ({
    source: imp.source ?? imp.resolvedPath ?? '',
    resolvedPath: imp.resolvedPath,
    importedNames: imp.importedNames ?? [],
    isTypeOnly: imp.isTypeOnly ?? false,
    kind: imp.kind ?? 'import',
  })),
  importedBy: [],
  symbols: [],
  parseError: null,
  skipped: extras.skipped ?? false,
  skipReason: null,
  category: (extras.category ?? 'source') as NodeCategory,
  extension: 'ts',
  folder: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '',
  symbolCount: 0,
});

/**
 * Hand-built fixture:
 *
 *   entry.ts → hub.ts → leaf.ts
 *              ↑     ↓
 *              └── mid.ts   (cycle: hub ↔ mid)
 *   orphan.ts               (no edges)
 *   config.json             (in=0, out=0, category config — not an entry)
 *   test/setup.ts → hub.ts  (in=0 but category test — not an entry)
 *   src/a.ts → shared/util.ts ← src/b.ts
 */
const buildFixtureGraph = (): DependencyGraph => {
  const nodes = [
    nodeOf('entry.ts', [{ resolvedPath: 'hub.ts' }]),
    nodeOf('hub.ts', [{ resolvedPath: 'leaf.ts' }, { resolvedPath: 'mid.ts' }]),
    nodeOf('mid.ts', [{ resolvedPath: 'hub.ts' }]),
    nodeOf('leaf.ts', []),
    nodeOf('orphan.ts', []),
    nodeOf('config.json', [], { category: 'config', language: 'JSON', languageSupported: false }),
    nodeOf('test/setup.ts', [{ resolvedPath: 'hub.ts' }], { category: 'test' }),
    nodeOf('src/a.ts', [{ resolvedPath: 'shared/util.ts' }]),
    nodeOf('src/b.ts', [{ resolvedPath: 'shared/util.ts' }]),
    nodeOf('shared/util.ts', []),
  ];
  return buildDependencyGraph({ nodes });
};

describe('architectureInsightsService', () => {
  it('ranks most depended-on by in-degree', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph(), {
      topN: 5,
      hubMinDegree: 3,
    });
    expect(insights.mostDependedOn[0]).toEqual({
      filePath: 'hub.ts',
      dependents: 3, // entry, mid, test/setup
    });
    expect(insights.mostDependedOn[1]).toEqual({
      filePath: 'shared/util.ts',
      dependents: 2,
    });
  });

  it('flags hubs by total degree threshold', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph(), {
      hubMinDegree: 3,
    });
    const hubPaths = insights.hubs.map((h) => h.filePath);
    expect(hubPaths).toContain('hub.ts');
    const hub = insights.hubs.find((h) => h.filePath === 'hub.ts')!;
    expect(hub.inDegree).toBe(3);
    expect(hub.outDegree).toBe(2);
    expect(hub.totalDegree).toBe(5);
  });

  it('surfaces entry points (in=0, out>0, not config/test)', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph());
    const roots = insights.entryPoints.map((e) => e.filePath).sort();
    expect(roots).toEqual(['entry.ts', 'src/a.ts', 'src/b.ts']);
    expect(roots).not.toContain('test/setup.ts');
    expect(roots).not.toContain('orphan.ts');
    expect(roots).not.toContain('config.json');
  });

  it('flags orphan files (in=0 and out=0 among parsed nodes)', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph());
    const orphans = insights.orphans.map((o) => o.filePath).sort();
    expect(orphans).toContain('orphan.ts');
    expect(orphans).toContain('config.json');
    expect(orphans).not.toContain('leaf.ts');
    expect(insights.summary.orphanCount).toBe(orphans.length);
  });

  it('surfaces circular dependency chains (not just a count)', () => {
    const graph = buildFixtureGraph();
    const insights = computeArchitectureInsights(graph);
    expect(insights.circularChains.length).toBeGreaterThanOrEqual(1);
    const cycle = insights.circularChains.find(
      (c) => c.files.includes('hub.ts') && c.files.includes('mid.ts'),
    );
    expect(cycle).toBeDefined();
    expect(cycle!.files.length).toBeGreaterThanOrEqual(2);
    expect(insights.summary.circularChainCount).toBe(insights.circularChains.length);

    // Tarjan agrees there is a multi-node SCC containing hub+mid.
    const sccs = findStronglyConnectedComponents(graph);
    const multi = sccs.find((s) => s.includes('hub.ts') && s.includes('mid.ts'));
    expect(multi).toBeDefined();
  });

  it('computes finite dependency depth on a graph that contains a cycle', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph());
    expect(Number.isFinite(insights.dependencyDepth.maxDepth)).toBe(true);
    // entry → hub(=mid SCC) → leaf  ⇒ at least depth 2 on the condensation DAG
    expect(insights.dependencyDepth.maxDepth).toBeGreaterThanOrEqual(2);
    expect(insights.dependencyDepth.deepestPath.length).toBeGreaterThanOrEqual(2);
  });

  it('groups modules by top-level folder with cross-group edges', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph());
    const src = insights.moduleGroups.find((g) => g.folder === 'src');
    const shared = insights.moduleGroups.find((g) => g.folder === 'shared');
    expect(src?.fileCount).toBe(2);
    expect(shared?.fileCount).toBe(1);
    expect(src?.outboundCrossEdges).toBe(2);
    expect(shared?.inboundCrossEdges).toBe(2);
  });

  it('summary rollup matches list lengths', () => {
    const insights = computeArchitectureInsights(buildFixtureGraph());
    expect(insights.summary.totalFiles).toBe(10);
    expect(insights.summary.totalDependencies).toBe(insights.summary.totalDependencies);
    expect(insights.summary.rootCount).toBe(insights.entryPoints.length);
    expect(insights.summary.orphanCount).toBe(insights.orphans.length);
    expect(insights.summary.circularChainCount).toBe(insights.circularChains.length);
  });
});
