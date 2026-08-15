import type { DependencyGraph, NodeCategory } from '../types/parsing.js';

/**
 * architectureInsightsService — Phase 5D
 *
 * Pure, deterministic metrics over an existing DependencyGraph. No I/O.
 * Designed so a later AI layer can consume the structured facts without
 * re-deriving graph structure.
 */

const DEFAULT_TOP_N = 10;
const HUB_MIN_DEGREE = 4;

const EXCLUDED_ENTRY_CATEGORIES: ReadonlySet<NodeCategory> = new Set([
  'config',
  'test',
]);

export interface RankedFile {
  filePath: string;
  dependents: number;
}

export interface HubFile {
  filePath: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
}

export interface EntryPointFile {
  filePath: string;
  outDegree: number;
}

export interface OrphanFile {
  filePath: string;
  language: string;
  languageSupported: boolean;
  category: NodeCategory;
}

export interface CircularChain {
  /** Stable id for React keys: sorted files joined. */
  id: string;
  /** Ordered cycle path; last file edges back to first when length > 1. */
  files: string[];
}

export interface DependencyDepth {
  /** Longest path length in edges on the cycle-collapsed DAG. */
  maxDepth: number;
  /** One concrete file path sequence realizing `maxDepth` (empty if none). */
  deepestPath: string[];
}

export interface ModuleGroup {
  /** Top-level folder, or '' for repo-root files. */
  folder: string;
  fileCount: number;
  internalEdges: number;
  outboundCrossEdges: number;
  inboundCrossEdges: number;
}

export interface ArchitectureInsightsSummary {
  totalFiles: number;
  totalDependencies: number;
  circularChainCount: number;
  rootCount: number;
  orphanCount: number;
}

export interface ArchitectureInsights {
  summary: ArchitectureInsightsSummary;
  mostDependedOn: RankedFile[];
  hubs: HubFile[];
  entryPoints: EntryPointFile[];
  orphans: OrphanFile[];
  circularChains: CircularChain[];
  dependencyDepth: DependencyDepth;
  moduleGroups: ModuleGroup[];
}

export interface ComputeInsightsOptions {
  topN?: number;
  hubMinDegree?: number;
}

interface Degrees {
  inDeg: Map<string, number>;
  outDeg: Map<string, number>;
  outAdj: Map<string, string[]>;
  inAdj: Map<string, string[]>;
}

const buildDegrees = (graph: DependencyGraph): Degrees => {
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();

  for (const n of graph.nodes) {
    inDeg.set(n.filePath, 0);
    outDeg.set(n.filePath, 0);
    outAdj.set(n.filePath, []);
    inAdj.set(n.filePath, []);
  }

  for (const e of graph.edges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    outAdj.get(e.from)?.push(e.to);
    inAdj.get(e.to)?.push(e.from);
  }

  return { inDeg, outDeg, outAdj, inAdj };
};

/**
 * Iterative Tarjan — returns every strongly connected component (including
 * singletons). Used for cycle extraction and condensation DAG depth.
 */
export const findStronglyConnectedComponents = (graph: DependencyGraph): string[][] => {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.filePath, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }

  const indexMap = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let index = 0;

  for (const startNode of adjacency.keys()) {
    if (indexMap.has(startNode)) continue;

    interface Frame {
      node: string;
      neighbors: string[];
      neighborIdx: number;
    }
    const frames: Frame[] = [];

    const pushNode = (v: string): void => {
      indexMap.set(v, index);
      lowlink.set(v, index);
      index += 1;
      stack.push(v);
      onStack.add(v);
      frames.push({ node: v, neighbors: adjacency.get(v) ?? [], neighborIdx: 0 });
    };

    pushNode(startNode);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const v = frame.node;

      if (frame.neighborIdx < frame.neighbors.length) {
        const w = frame.neighbors[frame.neighborIdx]!;
        frame.neighborIdx += 1;
        if (!indexMap.has(w)) {
          pushNode(w);
          continue;
        }
        if (onStack.has(w)) {
          const lowV = lowlink.get(v)!;
          const idxW = indexMap.get(w)!;
          if (idxW < lowV) lowlink.set(v, idxW);
        }
        continue;
      }

      const lowV = lowlink.get(v)!;
      const idxV = indexMap.get(v)!;
      if (lowV === idxV) {
        const scc: string[] = [];
        while (true) {
          const w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
          if (w === v) break;
        }
        sccs.push(scc);
      }

      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1]!;
        const parentLow = lowlink.get(parent.node)!;
        if (lowV < parentLow) lowlink.set(parent.node, lowV);
      }
    }
  }

  return sccs;
};

/**
 * Walk one simple cycle inside an SCC (or a self-loop). Returns an ordered
 * path where the last hop returns to the first node conceptually.
 */
const cyclePathInScc = (
  scc: string[],
  outAdj: Map<string, string[]>,
): string[] => {
  const member = new Set(scc);
  if (scc.length === 1) {
    const only = scc[0]!;
    const self = (outAdj.get(only) ?? []).includes(only);
    return self ? [only] : [];
  }

  // Prefer a deterministic start for stable output.
  const start = [...scc].sort()[0]!;
  const parent = new Map<string, string | null>();
  const queue = [start];
  parent.set(start, null);
  let foundBack: string | null = null;

  // BFS within SCC until we find an edge back to start, else any back-edge
  // that closes a cycle; fall back to listing sorted members.
  while (queue.length > 0 && foundBack === null) {
    const v = queue.shift()!;
    for (const w of outAdj.get(v) ?? []) {
      if (!member.has(w)) continue;
      if (w === start && v !== start) {
        foundBack = v;
        break;
      }
      if (!parent.has(w)) {
        parent.set(w, v);
        queue.push(w);
      }
    }
  }

  if (foundBack !== null) {
    const path: string[] = [start];
    // Reconstruct path start → … → foundBack, then implicit edge to start.
    const stack: string[] = [];
    let cur: string | null = foundBack;
    while (cur && cur !== start) {
      stack.push(cur);
      cur = parent.get(cur) ?? null;
    }
    while (stack.length > 0) path.push(stack.pop()!);
    return path;
  }

  // Dense SCC fallback: deterministic order of members.
  return [...scc].sort();
};

const topLevelFolder = (filePath: string): string => {
  const idx = filePath.indexOf('/');
  return idx === -1 ? '' : filePath.slice(0, idx);
};

const computeDepth = (
  graph: DependencyGraph,
  sccs: string[][],
  entryPaths: Set<string>,
  outAdj: Map<string, string[]>,
): DependencyDepth => {
  if (graph.nodes.length === 0) {
    return { maxDepth: 0, deepestPath: [] };
  }

  const nodeToScc = new Map<string, number>();
  sccs.forEach((scc, i) => {
    for (const f of scc) nodeToScc.set(f, i);
  });

  const sccCount = sccs.length;
  const dagOut = Array.from({ length: sccCount }, () => new Set<number>());
  const dagInDeg = new Array<number>(sccCount).fill(0);

  for (const e of graph.edges) {
    const a = nodeToScc.get(e.from);
    const b = nodeToScc.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    if (!dagOut[a]!.has(b)) {
      dagOut[a]!.add(b);
      dagInDeg[b]! += 1;
    }
  }

  // Representative file per SCC (prefer an entry point, else lexically first).
  const repr: string[] = sccs.map((scc) => {
    const entries = scc.filter((f) => entryPaths.has(f)).sort();
    if (entries.length > 0) return entries[0]!;
    return [...scc].sort()[0]!;
  });

  // Longest path DP on DAG, seeded from entry-point SCCs (or all DAG roots).
  const entrySccs = new Set<number>();
  for (const p of entryPaths) {
    const id = nodeToScc.get(p);
    if (id !== undefined) entrySccs.add(id);
  }
  const rootSccs: number[] = [];
  for (let i = 0; i < sccCount; i++) {
    if (dagInDeg[i] === 0) rootSccs.push(i);
  }
  const seedSccs = entrySccs.size > 0 ? entrySccs : new Set(rootSccs);

  const seedDepth = new Array<number>(sccCount).fill(-Infinity);
  const seedPred = new Array<number>(sccCount).fill(-1);
  for (const s of seedSccs) seedDepth[s] = 0;

  const indeg2 = [...dagInDeg];
  const q2: number[] = [...rootSccs];
  const topo: number[] = [];
  while (q2.length > 0) {
    const u = q2.shift()!;
    topo.push(u);
    for (const v of dagOut[u]!) {
      indeg2[v]! -= 1;
      if (indeg2[v] === 0) q2.push(v);
    }
  }
  for (const u of topo) {
    if (!Number.isFinite(seedDepth[u]!)) continue;
    for (const v of dagOut[u]!) {
      const cand = seedDepth[u]! + 1;
      if (cand > seedDepth[v]!) {
        seedDepth[v] = cand;
        seedPred[v] = u;
      }
    }
  }

  let best = 0;
  let bestNode = -1;
  for (let i = 0; i < sccCount; i++) {
    const d = seedDepth[i]!;
    if (Number.isFinite(d) && d > best) {
      best = d;
      bestNode = i;
    }
  }

  if (bestNode < 0 || best === 0) {
    const anyEntry = [...entryPaths].sort()[0];
    return {
      maxDepth: 0,
      deepestPath: anyEntry ? [anyEntry] : [],
    };
  }

  const sccPath: number[] = [];
  let cur = bestNode;
  while (cur !== -1) {
    sccPath.push(cur);
    cur = seedPred[cur]!;
  }
  sccPath.reverse();

  const deepestPath: string[] = [];
  for (const sccId of sccPath) {
    const scc = sccs[sccId]!;
    if (scc.length === 1) {
      deepestPath.push(repr[sccId]!);
    } else {
      const cycle = cyclePathInScc(scc, outAdj);
      deepestPath.push(...(cycle.length > 0 ? cycle : [repr[sccId]!]));
    }
  }

  return { maxDepth: best, deepestPath };
};

/**
 * Compute architecture insights from a dependency graph.
 */
export const computeArchitectureInsights = (
  graph: DependencyGraph,
  options: ComputeInsightsOptions = {},
): ArchitectureInsights => {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const hubMinDegree = options.hubMinDegree ?? HUB_MIN_DEGREE;

  const { inDeg, outDeg, outAdj } = buildDegrees(graph);

  const parsedNodes = graph.nodes.filter((n) => !n.skipped);

  // --- rankings ---
  const mostDependedOn: RankedFile[] = parsedNodes
    .map((n) => ({
      filePath: n.filePath,
      dependents: inDeg.get(n.filePath) ?? 0,
    }))
    .filter((r) => r.dependents > 0)
    .sort((a, b) => b.dependents - a.dependents || a.filePath.localeCompare(b.filePath))
    .slice(0, topN);

  const hubs: HubFile[] = parsedNodes
    .map((n) => {
      const inDegree = inDeg.get(n.filePath) ?? 0;
      const outDegree = outDeg.get(n.filePath) ?? 0;
      return {
        filePath: n.filePath,
        inDegree,
        outDegree,
        totalDegree: inDegree + outDegree,
      };
    })
    .filter((h) => h.totalDegree >= hubMinDegree)
    .sort((a, b) => b.totalDegree - a.totalDegree || a.filePath.localeCompare(b.filePath))
    .slice(0, topN);

  const entryPoints: EntryPointFile[] = parsedNodes
    .filter((n) => {
      if ((inDeg.get(n.filePath) ?? 0) !== 0) return false;
      if ((outDeg.get(n.filePath) ?? 0) === 0) return false; // orphans handled separately
      if (EXCLUDED_ENTRY_CATEGORIES.has(n.category)) return false;
      return true;
    })
    .map((n) => ({
      filePath: n.filePath,
      outDegree: outDeg.get(n.filePath) ?? 0,
    }))
    .sort((a, b) => b.outDegree - a.outDegree || a.filePath.localeCompare(b.filePath));

  const orphans: OrphanFile[] = parsedNodes
    .filter(
      (n) =>
        (inDeg.get(n.filePath) ?? 0) === 0 && (outDeg.get(n.filePath) ?? 0) === 0,
    )
    .map((n) => ({
      filePath: n.filePath,
      language: n.language,
      languageSupported: n.languageSupported,
      category: n.category,
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  // --- cycles ---
  const sccs = findStronglyConnectedComponents(graph);
  const circularChains: CircularChain[] = [];
  for (const scc of sccs) {
    const isMulti = scc.length > 1;
    const isSelfLoop =
      scc.length === 1 && (outAdj.get(scc[0]!) ?? []).includes(scc[0]!);
    if (!isMulti && !isSelfLoop) continue;
    const files = cyclePathInScc(scc, outAdj);
    if (files.length === 0) continue;
    const id = [...scc].sort().join('\u0000');
    circularChains.push({ id, files });
  }
  circularChains.sort((a, b) => b.files.length - a.files.length || a.id.localeCompare(b.id));

  // --- depth ---
  const entryPathSet = new Set(entryPoints.map((e) => e.filePath));
  const dependencyDepth = computeDepth(graph, sccs, entryPathSet, outAdj);

  // --- module groups (top-level folder) ---
  const groupFiles = new Map<string, number>();
  for (const n of parsedNodes) {
    const folder = topLevelFolder(n.filePath);
    groupFiles.set(folder, (groupFiles.get(folder) ?? 0) + 1);
  }

  const groupStats = new Map<
    string,
    { internal: number; outbound: number; inbound: number }
  >();
  for (const folder of groupFiles.keys()) {
    groupStats.set(folder, { internal: 0, outbound: 0, inbound: 0 });
  }

  for (const e of graph.edges) {
    const fromG = topLevelFolder(e.from);
    const toG = topLevelFolder(e.to);
    if (!groupStats.has(fromG)) groupStats.set(fromG, { internal: 0, outbound: 0, inbound: 0 });
    if (!groupStats.has(toG)) groupStats.set(toG, { internal: 0, outbound: 0, inbound: 0 });
    if (fromG === toG) {
      groupStats.get(fromG)!.internal += 1;
    } else {
      groupStats.get(fromG)!.outbound += 1;
      groupStats.get(toG)!.inbound += 1;
    }
  }

  const moduleGroups: ModuleGroup[] = [...groupFiles.entries()]
    .map(([folder, fileCount]) => {
      const s = groupStats.get(folder) ?? { internal: 0, outbound: 0, inbound: 0 };
      return {
        folder,
        fileCount,
        internalEdges: s.internal,
        outboundCrossEdges: s.outbound,
        inboundCrossEdges: s.inbound,
      };
    })
    .sort((a, b) => b.fileCount - a.fileCount || a.folder.localeCompare(b.folder));

  const summary: ArchitectureInsightsSummary = {
    totalFiles: parsedNodes.length,
    totalDependencies: graph.edges.length,
    circularChainCount: circularChains.length,
    rootCount: entryPoints.length,
    orphanCount: orphans.length,
  };

  return {
    summary,
    mostDependedOn,
    hubs,
    entryPoints,
    orphans,
    circularChains,
    dependencyDepth,
    moduleGroups,
  };
};
