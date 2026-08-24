import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideAnalysisLoad } from '../../lib/analysisLoad.ts';

describe('decideAnalysisLoad (Phase 4 fetch-by-id)', () => {
  it('is idle when no id is provided', () => {
    assert.equal(decideAnalysisLoad({ id: undefined, initial: null, reloadCounter: 0 }), 'idle');
  });

  it('uses location.state when ids match — no network', () => {
    assert.equal(
      decideAnalysisLoad({ id: 'abc', initial: { id: 'abc' }, reloadCounter: 0 }),
      'use-initial',
    );
  });

  it('fetches when location.state is missing', () => {
    assert.equal(
      decideAnalysisLoad({ id: 'abc', initial: null, reloadCounter: 0 }),
      'fetch',
    );
  });

  it('fetches when location.state belongs to a different analysis', () => {
    assert.equal(
      decideAnalysisLoad({
        id: 'new-id',
        initial: { id: 'old-id' },
        reloadCounter: 0,
      }),
      'fetch',
    );
  });

  it('fetches on reload even when initial matches', () => {
    assert.equal(
      decideAnalysisLoad({
        id: 'abc',
        initial: { id: 'abc' },
        reloadCounter: 1,
      }),
      'fetch',
    );
  });
});

describe('shareable path helpers', () => {
  it('builds absolute share URLs from root-relative paths', () => {
    const absolute = new URL('/graph/abc-123', 'http://localhost:5173').toString();
    assert.equal(absolute, 'http://localhost:5173/graph/abc-123');
  });
});
