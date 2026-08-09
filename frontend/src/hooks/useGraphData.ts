import { useEffect, useMemo, useRef, useState } from 'react';
import { getDependencies } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';
import type { DependencyGraph } from '../types/parsing';
import { buildNeighborIndex, findFilesInCycles, type NeighborIndex } from '../lib/graphCycles';

/**
 * useGraphData — fetch a repository's dependency graph and precompute the
 * derived structures the graph UI needs (in/out neighbors, cycle membership).
 *
 * We deliberately keep this a pure fetch hook. Layout is computed downstream
 * where the visible-node filter is applied, so filtering doesn't require a
 * refetch.
 */

export type GraphStatus = 'idle' | 'loading' | 'success' | 'error';

export interface GraphError {
  code: string;
  message: string;
}

export interface UseGraphDataResult {
  status: GraphStatus;
  graph: DependencyGraph | null;
  neighborIndex: NeighborIndex | null;
  filesInCycles: Set<string>;
  error: GraphError | null;
  reload: () => void;
}

export const useGraphData = (repositoryId: string | null): UseGraphDataResult => {
  const [status, setStatus] = useState<GraphStatus>('idle');
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState<GraphError | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!repositoryId) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setGraph(null);

    getDependencies(repositoryId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setGraph(data);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to load dependency graph.' });
        }
        setStatus('error');
      });
  }, [repositoryId, reloadCounter]);

  const neighborIndex = useMemo(
    () => (graph ? buildNeighborIndex(graph.edges) : null),
    [graph],
  );

  const filesInCycles = useMemo(
    () => (graph ? findFilesInCycles(graph) : new Set<string>()),
    [graph],
  );

  return {
    status,
    graph,
    neighborIndex,
    filesInCycles,
    error,
    reload: () => setReloadCounter((c) => c + 1),
  };
};
