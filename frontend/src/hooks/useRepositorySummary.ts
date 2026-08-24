import { useCallback, useEffect, useRef, useState } from 'react';
import { getSummary } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';

export type SummaryUiStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

export interface SummaryUiError {
  code: string;
  message: string;
}

export interface UseRepositorySummaryResult {
  status: SummaryUiStatus;
  text: string | null;
  cached: boolean;
  error: SummaryUiError | null;
  unavailableMessage: string | null;
  explain: () => void;
  reset: () => void;
}

/**
 * Lazy AI overview — only fetches when `explain()` is called.
 */
export const useRepositorySummary = (repositoryId: string | null): UseRepositorySummaryResult => {
  const [status, setStatus] = useState<SummaryUiStatus>('idle');
  const [text, setText] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<SummaryUiError | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [requestToken, setRequestToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!repositoryId || requestToken === 0) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setUnavailableMessage(null);

    getSummary(repositoryId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.status === 'unavailable') {
          setStatus('unavailable');
          setUnavailableMessage(data.message);
          setText(null);
          return;
        }
        setText(data.text);
        setCached(data.cached);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to generate an architecture overview.' });
        }
        setStatus('error');
      });
  }, [repositoryId, requestToken]);

  const explain = useCallback(() => {
    setRequestToken((n) => n + 1);
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setRequestToken(0);
    setStatus('idle');
    setText(null);
    setCached(false);
    setError(null);
    setUnavailableMessage(null);
  }, []);

  return { status, text, cached, error, unavailableMessage, explain, reset };
};
