import { useCallback, useEffect, useRef, useState } from 'react';
import { getFileInspector } from '../services/repositoryApi';
import { HttpError } from '../services/httpClient';
import type { FileInspectorResponse } from '../types/parsing';

/**
 * useFileInspector — fetch the per-file dependency detail for a given
 * (repositoryId, filePath). Cancels in-flight requests on rapid switching.
 */

export type InspectorStatus = 'idle' | 'loading' | 'success' | 'error';

export interface InspectorError {
  code: string;
  message: string;
}

export interface UseFileInspectorResult {
  status: InspectorStatus;
  data: FileInspectorResponse | null;
  error: InspectorError | null;
  selectedPath: string | null;
  select: (filePath: string | null) => void;
}

export const useFileInspector = (repositoryId: string): UseFileInspectorResult => {
  const [status, setStatus] = useState<InspectorStatus>('idle');
  const [data, setData] = useState<FileInspectorResponse | null>(null);
  const [error, setError] = useState<InspectorError | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const load = useCallback(
    async (filePath: string) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setStatus('loading');
      setError(null);

      try {
        const response = await getFileInspector(repositoryId, filePath, controller.signal);
        if (controller.signal.aborted) return;
        setData(response);
        setStatus('success');
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof HttpError) {
          setError({ code: err.code, message: err.message });
        } else {
          setError({ code: 'INTERNAL_ERROR', message: 'Failed to load file details.' });
        }
        setStatus('error');
      }
    },
    [repositoryId],
  );

  const select = useCallback(
    (filePath: string | null) => {
      setSelectedPath(filePath);
      if (filePath === null) {
        controllerRef.current?.abort();
        setStatus('idle');
        setData(null);
        setError(null);
        return;
      }
      void load(filePath);
    },
    [load],
  );

  return { status, data, error, selectedPath, select };
};
