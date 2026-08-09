import type { RepositoryAnalysis } from '../types/repository';
import { postJson } from './httpClient';

export const analyzeRepository = (repoUrl: string, signal?: AbortSignal): Promise<RepositoryAnalysis> =>
  postJson<RepositoryAnalysis>('/analyze', { repoUrl }, { signal });
