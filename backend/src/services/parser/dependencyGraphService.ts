import type {
  DependencyEdge,
  DependencyGraph,
  DependencyNode,
  DependencySummary,
} from '../../types/parsing.js';

/**
 * dependencyGraphService
 *
 * Given per-file parsing results, produce the DependencyGraph:
 *   - Deduplicate edges (a file that imports the same target twice → one edge).
 *   - Populate `importedBy` on every node.
 *   - Count strongly-connected components with size > 1 for the
 *     `circularDependencies` metric.
 *
 * Pure and deterministic. No I/O.
 */

export interface BuildGraphInput {
  nodes: DependencyNode[];
}

export const buildDependencyGraph = ({ nodes }: BuildGraphInput): DependencyGraph => {
  const nodeByPath = new Map<string, DependencyNode>();
  for (const n of nodes) {
    nodeByPath.set(n.filePath, n);
  }

  // Deduplicate edges per (from, to) pair.
  const edgeSet = new Set<string>();
  const edges: DependencyEdge[] = [];
  const importedByMap = new Map<string, Set<string>>();

  for (const node of nodes) {
    for (const imp of node.imports) {
      const target = imp.resolvedPath;
      if (!target) continue;
      if (!nodeByPath.has(target)) continue;
      if (target === node.filePath) continue; // self-import, ignore

      const key = `${node.filePath}\u0000${target}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: node.filePath, to: target });

      let inbound = importedByMap.get(target);
      if (!inbound) {
        inbound = new Set();
        importedByMap.set(target, inbound);
      }
      inbound.add(node.filePath);
    }
  }

  for (const node of nodes) {
    const inbound = importedByMap.get(node.filePath);
    node.importedBy = inbound ? Array.from(inbound).sort() : [];
  }

  return { nodes, edges };
};

/**
 * Count strongly-connected components with more than one node in the
 * directed graph. This equals the number of independent import cycles a
 * developer would notice.
 *
 * Implementation: iterative Tarjan's algorithm. Iterative to avoid stack
 * overflow on very large repositories.
 */
export const countCircularDependencies = (graph: DependencyGraph): number => {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.filePath, []);
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
  }

  const indexMap = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  let cycleSccCount = 0;

  for (const startNode of adjacency.keys()) {
    if (indexMap.has(startNode)) continue;

    // Iterative Tarjan using an explicit worklist.
    // Each frame: { node, neighborIdx }
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
          // Continue with the new top frame.
          continue;
        } else if (onStack.has(w)) {
          const lowV = lowlink.get(v)!;
          const idxW = indexMap.get(w)!;
          if (idxW < lowV) lowlink.set(v, idxW);
        }
        continue;
      }

      // All neighbors visited: finalize v.
      const lowV = lowlink.get(v)!;
      const idxV = indexMap.get(v)!;
      if (lowV === idxV) {
        const scc: string[] = [];
        // Pop until we get v back.
        while (true) {
          const w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
          if (w === v) break;
        }
        if (scc.length > 1) cycleSccCount += 1;
        // Self-loop still counts as a cycle even though the SCC has size 1.
        else if (scc.length === 1 && (adjacency.get(scc[0]!) ?? []).includes(scc[0]!)) {
          cycleSccCount += 1;
        }
      }

      frames.pop();
      // Propagate lowlink to parent frame if we just returned from a child.
      if (frames.length > 0) {
        const parent = frames[frames.length - 1]!;
        const parentLow = lowlink.get(parent.node)!;
        if (lowV < parentLow) lowlink.set(parent.node, lowV);
      }
    }
  }

  return cycleSccCount;
};

export interface SummarizeInput {
  graph: DependencyGraph;
  filesParsed: number;
  filesSkipped: number;
  filesFailed: number;
}

export const summarizeGraph = ({
  graph,
  filesParsed,
  filesSkipped,
  filesFailed,
}: SummarizeInput): DependencySummary => ({
  totalNodes: graph.nodes.length,
  totalEdges: graph.edges.length,
  filesParsed,
  filesSkipped,
  filesFailed,
  circularDependencies: countCircularDependencies(graph),
});
