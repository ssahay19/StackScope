import { useEffect, useRef, useState } from 'react';
import { getImpact } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';
import type { FileImpact } from '../types/impact';

export type ImpactStatus = 'idle' | 'loading' | 'success' | 'error';

export interface ImpactError {
  code: string;
  message: string;
}

export interface UseFileImpactResult {
  status: ImpactStatus;
  impact: FileImpact | null;
  error: ImpactError | null;
}

/**
 * Fetch change-impact for the selected file. Clears when selection is null.
 */
export const useFileImpact = (
  repositoryId: string | null,
  filePath: string | null,
): UseFileImpactResult => {
  const [status, setStatus] = useState<ImpactStatus>('idle');
  const [impact, setImpact] = useState<FileImpact | null>(null);
  const [error, setError] = useState<ImpactError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!repositoryId || !filePath) {
      controllerRef.current?.abort();
      setStatus('idle');
      setImpact(null);
      setError(null);
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus('loading');
    setError(null);
    setImpact(null);

    getImpact(repositoryId, filePath, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setImpact(data);
        setStatus('success');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to load change impact.' });
        }
        setStatus('error');
      });
  }, [repositoryId, filePath]);

  return { status, impact, error };
};
