import type { DependencyGraph, FileInspectorResponse } from '../types/parsing';
import type { ArchitectureInsights } from '../types/insights';
import type { FileImpact } from '../types/impact';
import type { RepositorySummaryResponse } from '../types/summary';
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

/** Phase 5D — deterministic architecture metrics over the stored graph. */
export const getInsights = (id: string, signal?: AbortSignal): Promise<ArchitectureInsights> =>
  getJson<ArchitectureInsights>(`/repository/${encodeURIComponent(id)}/insights`, { signal });

/** Phase 6 — opt-in AI architecture overview (structured facts only). */
export const getSummary = (id: string, signal?: AbortSignal): Promise<RepositorySummaryResponse> =>
  getJson<RepositorySummaryResponse>(`/repository/${encodeURIComponent(id)}/summary`, { signal });

const encodeFilePath = (filePath: string): string =>
  filePath.split('/').map(encodeURIComponent).join('/');

/** Phase 7 — change-impact for a single file. */
export const getImpact = (
  id: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<FileImpact> =>
  getJson<FileImpact>(
    `/repository/${encodeURIComponent(id)}/impact/${encodeFilePath(filePath)}`,
    { signal },
  );

/** Phase 7 — opt-in AI explanation of a file's blast radius. */
export const getImpactExplain = (
  id: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<RepositorySummaryResponse> =>
  getJson<RepositorySummaryResponse>(
    `/repository/${encodeURIComponent(id)}/impact/${encodeFilePath(filePath)}/explain`,
    { signal },
  );

export const getFileInspector = (
  id: string,
  filePath: string,
  signal?: AbortSignal,
): Promise<FileInspectorResponse> =>
  getJson<FileInspectorResponse>(
    `/repository/${encodeURIComponent(id)}/file/${encodeFilePath(filePath)}`,
    { signal },
  );
