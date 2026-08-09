import { describe, expect, it } from 'vitest';
import {
  buildDependencyGraph,
  countCircularDependencies,
  summarizeGraph,
} from '../dependencyGraphService.js';
import type { DependencyNode, ImportRef } from '../../../types/parsing.js';

const nodeOf = (filePath: string, imports: Array<Partial<ImportRef> & { resolvedPath: string | null }>): DependencyNode => ({
  filePath,
  language: 'TypeScript',
  languageSupported: true,
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
  skipped: false,
  skipReason: null,
  category: 'source',
  extension: 'ts',
  folder: '',
  symbolCount: 0,
});

describe('dependencyGraphService', () => {
  it('builds a graph with correct nodes and edges', () => {
    const nodes = [
      nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
      nodeOf('b.ts', [{ resolvedPath: 'c.ts' }]),
      nodeOf('c.ts', []),
    ];
    const graph = buildDependencyGraph({ nodes });
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toEqual([
      { from: 'a.ts', to: 'b.ts' },
      { from: 'b.ts', to: 'c.ts' },
    ]);
  });

  it('populates importedBy', () => {
    const nodes = [
      nodeOf('a.ts', [{ resolvedPath: 'shared.ts' }]),
      nodeOf('b.ts', [{ resolvedPath: 'shared.ts' }]),
      nodeOf('shared.ts', []),
    ];
    const graph = buildDependencyGraph({ nodes });
    const shared = graph.nodes.find((n) => n.filePath === 'shared.ts')!;
    expect(shared.importedBy).toEqual(['a.ts', 'b.ts']);
  });

  it('deduplicates parallel edges', () => {
    const nodes = [
      nodeOf('a.ts', [{ resolvedPath: 'b.ts' }, { resolvedPath: 'b.ts', kind: 'reexport' }]),
      nodeOf('b.ts', []),
    ];
    const graph = buildDependencyGraph({ nodes });
    expect(graph.edges).toHaveLength(1);
  });

  it('ignores unresolved imports (external packages)', () => {
    const nodes = [
      nodeOf('a.ts', [
        { resolvedPath: null, source: 'react' },
        { resolvedPath: 'b.ts' },
      ]),
      nodeOf('b.ts', []),
    ];
    const graph = buildDependencyGraph({ nodes });
    expect(graph.edges).toEqual([{ from: 'a.ts', to: 'b.ts' }]);
  });

  it('ignores self-imports', () => {
    const nodes = [nodeOf('a.ts', [{ resolvedPath: 'a.ts' }])];
    const graph = buildDependencyGraph({ nodes });
    expect(graph.edges).toEqual([]);
  });

  it('ignores imports whose target is not a scanned node', () => {
    const nodes = [nodeOf('a.ts', [{ resolvedPath: 'ghost.ts' }])];
    const graph = buildDependencyGraph({ nodes });
    expect(graph.edges).toEqual([]);
  });

  describe('circular dependency detection', () => {
    it('detects zero cycles on a DAG', () => {
      const nodes = [
        nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
        nodeOf('b.ts', [{ resolvedPath: 'c.ts' }]),
        nodeOf('c.ts', []),
      ];
      const graph = buildDependencyGraph({ nodes });
      expect(countCircularDependencies(graph)).toBe(0);
    });

    it('detects a simple two-node cycle', () => {
      const nodes = [
        nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
        nodeOf('b.ts', [{ resolvedPath: 'a.ts' }]),
      ];
      const graph = buildDependencyGraph({ nodes });
      expect(countCircularDependencies(graph)).toBe(1);
    });

    it('detects two independent cycles', () => {
      const nodes = [
        nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
        nodeOf('b.ts', [{ resolvedPath: 'a.ts' }]),
        nodeOf('c.ts', [{ resolvedPath: 'd.ts' }]),
        nodeOf('d.ts', [{ resolvedPath: 'c.ts' }]),
      ];
      const graph = buildDependencyGraph({ nodes });
      expect(countCircularDependencies(graph)).toBe(2);
    });

    it('collapses a three-node cycle into one SCC', () => {
      const nodes = [
        nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
        nodeOf('b.ts', [{ resolvedPath: 'c.ts' }]),
        nodeOf('c.ts', [{ resolvedPath: 'a.ts' }]),
      ];
      const graph = buildDependencyGraph({ nodes });
      expect(countCircularDependencies(graph)).toBe(1);
    });
  });

  describe('summarizeGraph', () => {
    it('produces the expected summary counts', () => {
      const nodes = [
        nodeOf('a.ts', [{ resolvedPath: 'b.ts' }]),
        nodeOf('b.ts', []),
      ];
      const graph = buildDependencyGraph({ nodes });
      const summary = summarizeGraph({
        graph,
        filesParsed: 2,
        filesSkipped: 0,
        filesFailed: 0,
      });
      expect(summary).toEqual({
        totalNodes: 2,
        totalEdges: 1,
        filesParsed: 2,
        filesSkipped: 0,
        filesFailed: 0,
        circularDependencies: 0,
      });
    });
  });
});
