import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';

/**
 * ELK layout wrapper.
 *
 * We run the `layered` algorithm — the same Sugiyama-family algorithm used by
 * GitHub's PR diff graph and every serious dependency visualizer. It produces
 * hierarchical top-to-bottom placements that read naturally for import graphs
 * (imports point downward).
 *
 * The layout is async because ELK ships as a WebWorker-friendly bundle. We
 * keep a single ELK instance across calls to avoid startup cost.
 */

const elk = new ELK();

export interface LayoutInputNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutInputEdge {
  id: string;
  from: string;
  to: string;
}

export interface LayoutedNode extends LayoutInputNode {
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: LayoutedNode[];
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.spacing.nodeNode': '30',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Route edges as orthogonal polylines — much easier to trace than splines.
  'elk.edgeRouting': 'ORTHOGONAL',
};

export interface LayoutOptions {
  direction?: 'DOWN' | 'RIGHT' | 'UP' | 'LEFT';
}

/**
 * Compute layout for a set of nodes and edges.
 *
 * Nodes not referenced by any edge are laid out too; ELK places them in their
 * own components/layers, so orphan files still appear in the graph.
 */
export const computeLayout = async (
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
  options: LayoutOptions = {},
): Promise<LayoutResult> => {
  if (nodes.length === 0) return { nodes: [], width: 0, height: 0 };

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      ...DEFAULT_OPTIONS,
      'elk.direction': options.direction ?? 'DOWN',
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  };

  const laidOut = await elk.layout(elkGraph);

  const positioned: LayoutedNode[] = (laidOut.children ?? []).map((c) => ({
    id: c.id!,
    width: c.width ?? 0,
    height: c.height ?? 0,
    x: c.x ?? 0,
    y: c.y ?? 0,
  }));

  return {
    nodes: positioned,
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
  };
};
