import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DependencyGraph as GraphData } from '../../types/parsing';
import type { NeighborIndex } from '../../lib/graphCycles';
import { computeLayout } from '../../lib/graphLayout';
import {
  DependencyNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  type DependencyNodeData,
} from './DependencyNode';
import {
  DependencyEdge,
  type DependencyEdgeData,
  type EdgeHighlightState,
} from './DependencyEdge';
import { GraphToolbar, emptyFilters, type GraphFilters } from './GraphToolbar';
import { Legend } from './Legend';
import { MiniMapControls } from './MiniMapControls';
import {
  collectAvailableFolders,
  collectAvailableLanguages,
  filterGraph,
  findSearchMatches,
} from '../../lib/graphFilters';
import { basename } from '../../lib/paths';

/**
 * DependencyGraph — React Flow scene.
 *
 * Data-flow (all pure `useMemo` except the async ELK step):
 *
 *   graph + filters ─► filterGraph ─► visibleNodes/Edges
 *                                          │
 *                                          ▼   (async ELK, effect)
 *                                    layoutedPositions
 *                                          │
 *   selection + search + layoutedPositions ─► React Flow nodes/edges
 *
 * Deriving the React Flow arrays via `useMemo` keeps highlight/search updates
 * as fast as possible — no extra `setNodes` round-trip.
 */

interface DependencyGraphProps {
  graph: GraphData;
  neighborIndex: NeighborIndex;
  filesInCycles: Set<string>;
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  /** Phase 7 — when set, light up the downstream blast radius instead of 1-hop neighbors. */
  impactMode?: boolean;
  impactDownstreamPaths?: Set<string>;
}

const nodeTypes = { dependency: DependencyNode };
const edgeTypes = { dependency: DependencyEdge };

export const DependencyGraph = (props: DependencyGraphProps) => (
  <ReactFlowProvider>
    <DependencyGraphInner {...props} />
  </ReactFlowProvider>
);

interface Positioned {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DependencyGraphInner = ({
  graph,
  neighborIndex,
  filesInCycles,
  selectedFilePath,
  onSelectFile,
  impactMode = false,
  impactDownstreamPaths,
}: DependencyGraphProps) => {
  const [filters, setFilters] = useState<GraphFilters>(emptyFilters);
  const [search, setSearch] = useState('');
  const [positioned, setPositioned] = useState<Positioned[]>([]);
  const [isLayouting, setIsLayouting] = useState(false);

  const flow = useReactFlow();
  const layoutTokenRef = useRef(0);

  const availableLanguages = useMemo(() => collectAvailableLanguages(graph), [graph]);
  const availableFolders = useMemo(() => collectAvailableFolders(graph), [graph]);

  const { visibleNodes, visiblePaths } = useMemo(
    () => filterGraph(graph, { filters, filesInCycles }),
    [graph, filters, filesInCycles],
  );

  const visibleEdges = useMemo(
    () =>
      graph.edges.filter((e) => visiblePaths.has(e.from) && visiblePaths.has(e.to)),
    [graph.edges, visiblePaths],
  );

  // ------------- ELK layout (async, effect) -------------
  useEffect(() => {
    let cancelled = false;
    const token = ++layoutTokenRef.current;
    setIsLayouting(true);

    computeLayout(
      visibleNodes.map((n) => ({ id: n.filePath, width: NODE_WIDTH, height: NODE_HEIGHT })),
      visibleEdges.map((e) => ({ id: `${e.from}->${e.to}`, from: e.from, to: e.to })),
    )
      .then((result) => {
        if (cancelled || token !== layoutTokenRef.current) return;
        setPositioned(result.nodes);
        setIsLayouting(false);
        requestAnimationFrame(() => {
          if (token !== layoutTokenRef.current) return;
          flow.fitView({ duration: 250, padding: 0.2 });
        });
      })
      .catch(() => {
        if (!cancelled) setIsLayouting(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, visibleEdges]);

  // ------------- Search matches -------------
  const searchMatches = useMemo(
    () => findSearchMatches(visibleNodes, search),
    [visibleNodes, search],
  );

  // ------------- Derive React Flow nodes/edges -------------
  const nodesByPath = useMemo(() => {
    const map = new Map<string, GraphData['nodes'][number]>();
    for (const n of graph.nodes) map.set(n.filePath, n);
    return map;
  }, [graph.nodes]);

  const nodes = useMemo<Node<DependencyNodeData>[]>(() => {
    return positioned
      .map((p): Node<DependencyNodeData> | null => {
        const domainNode = nodesByPath.get(p.id);
        if (!domainNode) return null;

        let highlight: DependencyNodeData['highlight'] = null;
        if (selectedFilePath) {
          if (p.id === selectedFilePath) {
            highlight = 'selected';
          } else if (impactMode && impactDownstreamPaths) {
            highlight = impactDownstreamPaths.has(p.id) ? 'impact' : 'dimmed';
          } else if (
            neighborIndex.outgoing.get(selectedFilePath)?.has(p.id) ||
            neighborIndex.incoming.get(selectedFilePath)?.has(p.id)
          ) {
            highlight = 'connected';
          } else {
            highlight = 'dimmed';
          }
        }
        if (searchMatches.has(p.id) && highlight !== 'selected') {
          highlight = 'match';
        }

        return {
          id: p.id,
          type: 'dependency',
          position: { x: p.x, y: p.y },
          width: p.width,
          height: p.height,
          data: { node: domainNode, highlight, filename: basename(p.id) },
          draggable: false,
          selectable: true,
          focusable: true,
        };
      })
      .filter((n): n is Node<DependencyNodeData> => n !== null);
  }, [positioned, nodesByPath, selectedFilePath, neighborIndex, searchMatches, impactMode, impactDownstreamPaths]);

  const edges = useMemo<Edge<DependencyEdgeData>[]>(() => {
    return visibleEdges.map((e) => {
      let state: EdgeHighlightState = 'default';
      if (selectedFilePath) {
        if (impactMode && impactDownstreamPaths) {
          const fromHit =
            e.from === selectedFilePath || impactDownstreamPaths.has(e.from);
          const toHit = e.to === selectedFilePath || impactDownstreamPaths.has(e.to);
          if (fromHit && toHit) state = 'outgoing';
          else state = 'dimmed';
        } else if (e.from === selectedFilePath) {
          state = 'outgoing';
        } else if (e.to === selectedFilePath) {
          state = 'incoming';
        } else {
          state = 'dimmed';
        }
      }
      return {
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        type: 'dependency',
        data: { state },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.35)' },
      };
    });
  }, [visibleEdges, selectedFilePath, impactMode, impactDownstreamPaths]);

  // ------------- Auto-center on search matches -------------
  useEffect(() => {
    if (searchMatches.size === 0) return;
    const matchIds = Array.from(searchMatches);
    const matchNodes = flow.getNodes().filter((n) => matchIds.includes(n.id));
    if (matchNodes.length === 0) return;
    flow.fitView({
      nodes: matchNodes.map((n) => ({ id: n.id })),
      duration: 300,
      padding: 0.4,
      maxZoom: 1.2,
    });
  }, [searchMatches, flow]);

  // ------------- Handlers -------------
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => onSelectFile(node.id),
    [onSelectFile],
  );

  const handlePaneClick = useCallback(() => onSelectFile(null), [onSelectFile]);

  const handleReset = useCallback(() => {
    onSelectFile(null);
    setSearch('');
    setFilters(emptyFilters());
    flow.fitView({ duration: 300, padding: 0.2 });
  }, [flow, onSelectFile]);

  return (
    <div className="relative h-full w-full" role="region" aria-label="Dependency graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false}
        nodesDraggable={false}
        edgesFocusable
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.06)" />

        <Panel position="top-center" className="!m-3">
          <GraphToolbar
            search={search}
            onSearchChange={setSearch}
            filters={filters}
            onFiltersChange={setFilters}
            availableLanguages={availableLanguages}
            availableFolders={availableFolders}
            matchCount={visibleNodes.length}
            totalCount={graph.nodes.length}
          />
        </Panel>

        <Panel position="bottom-left" className="!m-3">
          <Legend />
        </Panel>

        <Panel position="bottom-right" className="!m-3 flex flex-col items-end gap-2">
          <MiniMapControls onReset={handleReset} />
        </Panel>

        {isLayouting ? (
          <Panel position="top-left" className="!m-3">
            <div className="glass rounded-lg px-3 py-1.5 text-xs text-white/60 shadow-glass">
              Laying out graph…
            </div>
          </Panel>
        ) : null}

        {!isLayouting && visibleNodes.length === 0 ? (
          <Panel position="top-center" className="!m-24">
            <div className="glass rounded-xl px-4 py-3 text-sm text-white/70 shadow-glass">
              No files match the current filters.{' '}
              <button
                type="button"
                onClick={handleReset}
                className="underline decoration-white/40 hover:text-white"
              >
                Clear filters
              </button>
              .
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
    </div>
  );
};
