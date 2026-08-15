import { useEffect, useRef, useState } from 'react';
import { getInsights } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';
import type { ArchitectureInsights } from '../types/insights';

export type InsightsStatus = 'idle' | 'loading' | 'success' | 'error';

export interface InsightsError {
  code: string;
  message: string;
}

export interface UseArchitectureInsightsResult {
  status: InsightsStatus;
  insights: ArchitectureInsights | null;
  error: InsightsError | null;
  reload: () => void;
}

/**
 * Fetch deterministic architecture insights for a stored analysis id.
 */
export const useArchitectureInsights = (
  repositoryId: string | null,
): UseArchitectureInsightsResult => {
  const [status, setStatus] = useState<InsightsStatus>('idle');
  const [insights, setInsights] = useState<ArchitectureInsights | null>(null);
  const [error, setError] = useState<InsightsError | null>(null);
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
    setInsights(null);

    getInsights(repositoryId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setInsights(data);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to load architecture insights.' });
        }
        setStatus('error');
      });
  }, [repositoryId, reloadCounter]);

  return {
    status,
    insights,
    error,
    reload: () => setReloadCounter((c) => c + 1),
  };
};
