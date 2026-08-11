import { useEffect, useRef, useState } from 'react';
import { getAnalysis } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';
import type { RepositoryAnalysis } from '../types/repository';

/**
 * useAnalysisById — resolve a RepositoryAnalysis for /result/:id and /graph/:id.
 *
 * Preference order:
 *   1. `initial` (from location.state) when its id matches the URL param —
 *      avoids a round-trip right after POST /api/analyze.
 *   2. Fetch from GET /api/repository/:id otherwise (hard refresh / shared link).
 *
 * A missing or expired analysis surfaces as `status: 'error'` with a NOT_FOUND
 * code so the page can offer a clear "analyze again" path instead of bouncing
 * to landing without explanation.
 */

export type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AnalysisError {
  code: string;
  message: string;
}

export interface UseAnalysisByIdResult {
  status: AnalysisStatus;
  analysis: RepositoryAnalysis | null;
  error: AnalysisError | null;
  reload: () => void;
}

export const useAnalysisById = (
  id: string | undefined,
  initial: RepositoryAnalysis | null | undefined,
): UseAnalysisByIdResult => {
  const initialMatches = Boolean(initial && id && initial.id === id);
  const [status, setStatus] = useState<AnalysisStatus>(
    initialMatches ? 'success' : id ? 'loading' : 'idle',
  );
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(
    initialMatches ? (initial as RepositoryAnalysis) : null,
  );
  const [error, setError] = useState<AnalysisError | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!id) {
      setStatus('idle');
      setAnalysis(null);
      setError(null);
      return;
    }

    // Prefer the in-memory analysis handed over via router state when the ids
    // match — but only on the first load. `reload()` must always hit the API.
    if (initial && initial.id === id && reloadCounter === 0) {
      setAnalysis(initial);
      setStatus('success');
      setError(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);

    getAnalysis(id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setAnalysis(data);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to load analysis.' });
        }
        setAnalysis(null);
        setStatus('error');
      });
  }, [id, initial, reloadCounter]);

  return {
    status,
    analysis,
    error,
    reload: () => setReloadCounter((c) => c + 1),
  };
};
