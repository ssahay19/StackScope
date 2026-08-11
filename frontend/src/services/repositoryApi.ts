import type { DependencyGraph, FileInspectorResponse } from '../types/parsing';
import type { RepositoryAnalysis } from '../types/repository';
import { getJson } from './httpClient';

/**
 * Read endpoints keyed on the analysis `id` returned by POST /api/analyze.
 */

/** Phase 4 — full analysis payload for hard-refresh / shareable links. */
export const getAnalysis = (id: string, signal?: AbortSignal): Promise<RepositoryAnalysis> =>
  getJson<RepositoryAnalysis>(`/repository/${encodeURIComponent(id)}`, { signal });

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
