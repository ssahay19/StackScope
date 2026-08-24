import type { RepositoryAnalysis } from '../types/repository';

/**
 * Pure load decision for /result/:id and /graph/:id.
 *
 * Extracted from useAnalysisById so Phase 4's fetch-by-id contract can be
 * unit-tested without spinning up jsdom / Vitest workers.
 */

export type AnalysisLoadAction = 'idle' | 'use-initial' | 'fetch';

export const decideAnalysisLoad = (input: {
  id: string | undefined;
  initial: Pick<RepositoryAnalysis, 'id'> | null | undefined;
  reloadCounter: number;
}): AnalysisLoadAction => {
  if (!input.id) return 'idle';
  if (input.initial && input.initial.id === input.id && input.reloadCounter === 0) {
    return 'use-initial';
  }
  return 'fetch';
};
