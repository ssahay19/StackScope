import type { DependencyGraph, FileInspectorResponse } from '../types/parsing';
import { getJson } from './httpClient';

/**
 * Phase 2 read endpoints. All routes are keyed on the analysis `id`
 * returned by POST /api/analyze.
 */

export const getDependencies = (id: string, signal?: AbortSignal): Promise<DependencyGraph> =>
  getJson<DependencyGraph>(`/repository/${encodeURIComponent(id)}/dependencies`, { signal });

export const getFileInspector = (
  id: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<FileInspectorResponse> => {
  // The server route is `/file/*` — the file path is embedded, slashes and all.
  // We encode each segment so unusual characters don't break routing, while
  // keeping the slashes as path separators.
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return getJson<FileInspectorResponse>(
    `/repository/${encodeURIComponent(id)}/file/${encoded}`,
    { signal },
  );
};
