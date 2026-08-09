import type { DependencyEdge, DependencyGraph } from '../types/parsing';

/**
 * Iterative Tarjan's SCC — identical algorithm to the backend's, ported here
 * so the "circular dependencies" filter and node highlighting can run without
 * an extra API round-trip.
 *
 * Returns the set of file paths that belong to a strongly-connected component
 * of size > 1 (or a self-loop).
 */

export const findFilesInCycles = (graph: DependencyGraph): Set<string> => {
  const cycleFiles = new Set<string>();
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

  interface Frame {
    node: string;
    neighbors: string[];
    neighborIdx: number;
  }

  for (const startNode of adjacency.keys()) {
    if (indexMap.has(startNode)) continue;

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
        } else if (onStack.has(w)) {
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
        const isSelfLoop = scc.length === 1 && (adjacency.get(scc[0]!) ?? []).includes(scc[0]!);
        if (scc.length > 1 || isSelfLoop) {
          for (const s of scc) cycleFiles.add(s);
        }
      }

      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1]!;
        const parentLow = lowlink.get(parent.node)!;
        if (lowV < parentLow) lowlink.set(parent.node, lowV);
      }
    }
  }

  return cycleFiles;
};

/** Build in/out neighbor lookups once per graph load. */
export interface NeighborIndex {
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
}

export const buildNeighborIndex = (edges: DependencyEdge[]): NeighborIndex => {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const e of edges) {
    let out = outgoing.get(e.from);
    if (!out) {
      out = new Set();
      outgoing.set(e.from, out);
    }
    out.add(e.to);

    let inn = incoming.get(e.to);
    if (!inn) {
      inn = new Set();
      incoming.set(e.to, inn);
    }
    inn.add(e.from);
  }
  return { outgoing, incoming };
};
