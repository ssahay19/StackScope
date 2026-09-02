import { useCallback, useEffect, useRef, useState } from 'react';
import { getImpactExplain } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';

export type ImpactExplainStatus = 'idle' | 'loading' | 'success' | 'error' | 'unavailable';

export interface ImpactExplainError {
  code: string;
  message: string;
}

export interface UseImpactExplainResult {
  status: ImpactExplainStatus;
  text: string | null;
  cached: boolean;
  error: ImpactExplainError | null;
  unavailableMessage: string | null;
  explain: () => void;
  reset: () => void;
}

/**
 * Lazy AI impact explanation — only fetches when `explain()` is called.
 */
export const useImpactExplain = (
  repositoryId: string | null,
  filePath: string | null,
): UseImpactExplainResult => {
  const [status, setStatus] = useState<ImpactExplainStatus>('idle');
  const [text, setText] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<ImpactExplainError | null>(null);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const [requestToken, setRequestToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  // Reset when the selected file changes.
  useEffect(() => {
    controllerRef.current?.abort();
    setRequestToken(0);
    setStatus('idle');
    setText(null);
    setCached(false);
    setError(null);
    setUnavailableMessage(null);
  }, [repositoryId, filePath]);

  useEffect(() => {
    if (!repositoryId || !filePath || requestToken === 0) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setUnavailableMessage(null);

    getImpactExplain(repositoryId, filePath, controller.signal)
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
          setError({
            code: 'INTERNAL_ERROR',
            message: 'Failed to generate an impact explanation.',
          });
        }
        setStatus('error');
      });
  }, [repositoryId, filePath, requestToken]);

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
