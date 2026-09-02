import type { DependencyGraph } from '../types/parsing.js';

/**
 * impactService — Phase 7
 *
 * Pure, deterministic change-impact over an existing DependencyGraph.
 * Downstream = transitive closure over importedBy (who depends on this file).
 * Upstream = transitive closure over imports (what this file depends on).
 * Cycle-safe via visited-set BFS (no recursion).
 */

export interface ImpactedFile {
  filePath: string;
  /** Hop count from the target file; direct importers/imports = 1. */
  distance: number;
  relation: 'direct' | 'transitive';
}

export interface ImpactDirection {
  total: number;
  directCount: number;
  transitiveCount: number;
  maxDistance: number;
  files: ImpactedFile[];
}

export interface FileImpact {
  filePath: string;
  downstream: ImpactDirection;
  upstream: ImpactDirection;
}

interface AdjMaps {
  /** file → files that import it (affected if file changes). */
  importedBy: Map<string, string[]>;
  /** file → files it imports (dependencies). */
  imports: Map<string, string[]>;
}

const buildAdj = (graph: DependencyGraph): AdjMaps => {
  const importedBy = new Map<string, string[]>();
  const imports = new Map<string, string[]>();

  for (const n of graph.nodes) {
    importedBy.set(n.filePath, []);
    imports.set(n.filePath, []);
  }

  for (const e of graph.edges) {
    // Edge A → B means A imports B.
    imports.get(e.from)?.push(e.to);
    importedBy.get(e.to)?.push(e.from);
  }

  return { importedBy, imports };
};

/**
 * BFS over an adjacency map. Skips the start node in the result.
 * Visited-set guarantees termination on cyclic graphs.
 */
const bfsClosure = (
  start: string,
  adj: Map<string, string[]>,
): ImpactedFile[] => {
  const files: ImpactedFile[] = [];
  const visited = new Set<string>([start]);
  const queue: Array<{ path: string; distance: number }> = [];

  for (const neighbor of adj.get(start) ?? []) {
    if (visited.has(neighbor)) continue;
    visited.add(neighbor);
    queue.push({ path: neighbor, distance: 1 });
  }

  while (queue.length > 0) {
    const { path, distance } = queue.shift()!;
    files.push({
      filePath: path,
      distance,
      relation: distance === 1 ? 'direct' : 'transitive',
    });

    for (const next of adj.get(path) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push({ path: next, distance: distance + 1 });
    }
  }

  files.sort(
    (a, b) => a.distance - b.distance || a.filePath.localeCompare(b.filePath),
  );
  return files;
};

const toDirection = (files: ImpactedFile[]): ImpactDirection => {
  const directCount = files.filter((f) => f.relation === 'direct').length;
  const transitiveCount = files.length - directCount;
  let maxDistance = 0;
  for (const f of files) {
    if (f.distance > maxDistance) maxDistance = f.distance;
  }
  return {
    total: files.length,
    directCount,
    transitiveCount,
    maxDistance,
    files,
  };
};

/**
 * Compute change-impact for `filePath`. Returns `null` if the file is not
 * in the graph (caller should 404).
 */
export const computeImpact = (
  graph: DependencyGraph,
  filePath: string,
): FileImpact | null => {
  const exists = graph.nodes.some((n) => n.filePath === filePath);
  if (!exists) return null;

  const { importedBy, imports } = buildAdj(graph);

  return {
    filePath,
    downstream: toDirection(bfsClosure(filePath, importedBy)),
    upstream: toDirection(bfsClosure(filePath, imports)),
  };
};
