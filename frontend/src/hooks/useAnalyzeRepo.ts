import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeRepository } from '../services/analyzeApi';
import { HttpError } from '../services/httpClient';
import type { RepositoryAnalysis } from '../types/repository';

/**
 * useAnalyzeRepo — the single source of truth for analyze state.
 *
 * State machine:
 *   idle → loading → success
 *                 ↘ error
 *
 * Cancellation: abort any in-flight request when a new one is started or
 * when the component unmounts. This prevents late responses from clobbering
 * newer state.
 */

export type AnalyzeStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UserFacingError {
  code: string;
  title: string;
  message: string;
}

export interface UseAnalyzeRepoResult {
  status: AnalyzeStatus;
  data: RepositoryAnalysis | null;
  error: UserFacingError | null;
  analyze: (repoUrl: string) => Promise<RepositoryAnalysis | null>;
  reset: () => void;
}

const humanizeError = (err: unknown): UserFacingError => {
  if (err instanceof HttpError) {
    const titleFor: Record<string, string> = {
      INVALID_REPO_URL: 'That URL doesn’t look right',
      CLONE_FAILED: 'We couldn’t clone that repository',
      REPO_TOO_LARGE: 'This repository is too large',
      SCAN_FAILED: 'We couldn’t finish scanning',
      RATE_LIMITED: 'Slow down for a moment',
      NETWORK_ERROR: 'Can’t reach the StackScope API',
      INVALID_RESPONSE: 'The server returned something unexpected',
      NOT_FOUND: 'Not found',
      INTERNAL_ERROR: 'Something went wrong',
    };
    return {
      code: err.code,
      title: titleFor[err.code] ?? 'Something went wrong',
      message: err.message,
    };
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { code: 'ABORTED', title: 'Analysis cancelled', message: 'The request was cancelled.' };
  }
  return {
    code: 'INTERNAL_ERROR',
    title: 'Unexpected error',
    message: 'An unexpected error occurred.',
  };
};

export const useAnalyzeRepo = (): UseAnalyzeRepoResult => {
  const [status, setStatus] = useState<AnalyzeStatus>('idle');
  const [data, setData] = useState<RepositoryAnalysis | null>(null);
  const [error, setError] = useState<UserFacingError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const analyze = useCallback(async (repoUrl: string): Promise<RepositoryAnalysis | null> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setData(null);

    try {
      const result = await analyzeRepository(repoUrl, controller.signal);
      if (controller.signal.aborted) return null;
      setData(result);
      setStatus('success');
      return result;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setError(humanizeError(err));
      setStatus('error');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setStatus('idle');
    setData(null);
    setError(null);
  }, []);

  return { status, data, error, analyze, reset };
};
