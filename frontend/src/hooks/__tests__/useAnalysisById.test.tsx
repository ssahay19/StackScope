import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAnalysisById } from '../useAnalysisById';
import type { RepositoryAnalysis } from '../../types/repository';
import { HttpError } from '../../services/httpClient';

vi.mock('../../services/repositoryApi', () => ({
  getAnalysis: vi.fn(),
}));

import { getAnalysis } from '../../services/repositoryApi';

const mockedGet = vi.mocked(getAnalysis);

const sample = (id = 'abc-123'): RepositoryAnalysis => ({
  id,
  name: 'widgets',
  owner: 'acme',
  language: 'TypeScript',
  totalFiles: 3,
  totalFolders: 1,
  languages: [{ name: 'TypeScript', fileCount: 3, percent: 100 }],
  tree: { name: 'widgets', path: '', type: 'folder', children: [] },
  analyzedAt: '2026-08-09T00:00:00.000Z',
  dependencySummary: {
    totalNodes: 1,
    totalEdges: 0,
    filesParsed: 1,
    filesSkipped: 0,
    filesFailed: 0,
    circularDependencies: 0,
  },
});

beforeEach(() => {
  mockedGet.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAnalysisById', () => {
  it('uses location.state when the id matches — no network call', async () => {
    const initial = sample('abc-123');
    const { result } = renderHook(() => useAnalysisById('abc-123', initial));

    expect(result.current.status).toBe('success');
    expect(result.current.analysis).toEqual(initial);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('fetches by id when location.state is missing', async () => {
    const fetched = sample('xyz-456');
    mockedGet.mockResolvedValueOnce(fetched);

    const { result } = renderHook(() => useAnalysisById('xyz-456', null));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.analysis).toEqual(fetched);
    expect(mockedGet).toHaveBeenCalledWith('xyz-456', expect.any(AbortSignal));
  });

  it('fetches by id when location.state belongs to a different analysis', async () => {
    const stale = sample('old-id');
    const fresh = sample('new-id');
    mockedGet.mockResolvedValueOnce(fresh);

    const { result } = renderHook(() => useAnalysisById('new-id', stale));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.analysis?.id).toBe('new-id');
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('surfaces NOT_FOUND as an error state', async () => {
    mockedGet.mockRejectedValueOnce(
      new HttpError(404, 'NOT_FOUND', 'Analysis not found or has expired.'),
    );

    const { result } = renderHook(() => useAnalysisById('missing', null));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe('NOT_FOUND');
    expect(result.current.analysis).toBeNull();
  });

  it('reload() re-fetches the analysis', async () => {
    mockedGet
      .mockResolvedValueOnce(sample('r1'))
      .mockResolvedValueOnce(sample('r1'));

    const { result } = renderHook(() => useAnalysisById('r1', null));
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.reload();
    });

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });

  it('is idle when no id is provided', () => {
    const { result } = renderHook(() => useAnalysisById(undefined, null));
    expect(result.current.status).toBe('idle');
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
