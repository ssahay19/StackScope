import { describe, expect, it } from 'vitest';
import { computeImpact } from '../impactService.js';
import { buildDependencyGraph } from '../parser/dependencyGraphService.js';
import type { DependencyNode, ImportRef } from '../../types/parsing.js';

const nodeOf = (
  filePath: string,
  imports: Array<Partial<ImportRef> & { resolvedPath: string | null }>,
): DependencyNode => ({
  filePath,
  language: 'TypeScript',
  languageSupported: true,
  imports: imports.map((imp) => ({
    source: imp.source ?? imp.resolvedPath ?? '',
    resolvedPath: imp.resolvedPath,
    importedNames: [],
    isTypeOnly: false,
    kind: 'import',
  })),
  importedBy: [],
  symbols: [],
  parseError: null,
  skipped: false,
  skipReason: null,
  category: 'source',
  extension: 'ts',
  folder: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '',
  symbolCount: 0,
});

/**
 * Hand-built fixture:
 *
 *   entry.ts → mid.ts → hub.ts → leaf.ts
 *                 ↑         ↓
 *                 └─ cycle.ts  (hub ↔ cycle)
 *   orphan.ts
 *
 * Changing hub.ts affects: mid (direct via… wait)
 * Edges: A→B means A imports B.
 *   entry imports mid
 *   mid imports hub
 *   hub imports leaf, cycle
 *   cycle imports hub
 *
 * Downstream of hub (who imports hub, transitively):
 *   direct: mid, cycle
 *   transitive via mid: entry
 *   (cycle is in a cycle with hub — BFS visits cycle once as direct)
 *
 * Upstream of hub: leaf, cycle (direct); from cycle nothing new beyond hub (visited)
 */
const buildFixture = () =>
  buildDependencyGraph({
    nodes: [
      nodeOf('entry.ts', [{ resolvedPath: 'mid.ts' }]),
      nodeOf('mid.ts', [{ resolvedPath: 'hub.ts' }]),
      nodeOf('hub.ts', [{ resolvedPath: 'leaf.ts' }, { resolvedPath: 'cycle.ts' }]),
      nodeOf('cycle.ts', [{ resolvedPath: 'hub.ts' }]),
      nodeOf('leaf.ts', []),
      nodeOf('orphan.ts', []),
    ],
  });

describe('computeImpact', () => {
  it('returns null for an unknown file', () => {
    expect(computeImpact(buildFixture(), 'missing.ts')).toBeNull();
  });

  it('splits direct vs transitive downstream dependents', () => {
    const impact = computeImpact(buildFixture(), 'hub.ts')!;
    expect(impact.downstream.directCount).toBe(2); // mid, cycle
    expect(impact.downstream.files.filter((f) => f.relation === 'direct').map((f) => f.filePath).sort()).toEqual([
      'cycle.ts',
      'mid.ts',
    ]);
    expect(impact.downstream.files.some((f) => f.filePath === 'entry.ts' && f.relation === 'transitive')).toBe(
      true,
    );
    expect(impact.downstream.total).toBe(3); // mid, cycle, entry
    expect(impact.downstream.transitiveCount).toBe(1);
    expect(impact.downstream.maxDistance).toBeGreaterThanOrEqual(2);
  });

  it('computes upstream (depends-on) closure', () => {
    const impact = computeImpact(buildFixture(), 'hub.ts')!;
    const upPaths = impact.upstream.files.map((f) => f.filePath).sort();
    expect(upPaths).toContain('leaf.ts');
    expect(upPaths).toContain('cycle.ts');
    // entry/mid are not upstream of hub
    expect(upPaths).not.toContain('entry.ts');
    expect(upPaths).not.toContain('mid.ts');
  });

  it('terminates on a cyclic graph and includes cycle members once', () => {
    const impact = computeImpact(buildFixture(), 'hub.ts')!;
    const down = impact.downstream.files.map((f) => f.filePath);
    const up = impact.upstream.files.map((f) => f.filePath);
    // No duplicates
    expect(new Set(down).size).toBe(down.length);
    expect(new Set(up).size).toBe(up.length);
    // cycle appears in both directions but traversal finished
    expect(down).toContain('cycle.ts');
    expect(up).toContain('cycle.ts');
  });

  it('returns empty upstream for a sink file with no imports', () => {
    const impact = computeImpact(buildFixture(), 'leaf.ts')!;
    // leaf imports nothing
    expect(impact.upstream.total).toBe(0);
    // but hub imports leaf → downstream is non-empty
    expect(impact.downstream.total).toBeGreaterThan(0);
    expect(impact.downstream.files.some((f) => f.filePath === 'hub.ts' && f.relation === 'direct')).toBe(
      true,
    );
  });

  it('returns empty impact for an orphan', () => {
    const impact = computeImpact(buildFixture(), 'orphan.ts')!;
    expect(impact.downstream.total).toBe(0);
    expect(impact.upstream.total).toBe(0);
  });

  it('marks distance 1 as direct', () => {
    const impact = computeImpact(buildFixture(), 'mid.ts')!;
    // entry imports mid → entry is direct downstream
    const entry = impact.downstream.files.find((f) => f.filePath === 'entry.ts');
    expect(entry).toEqual({ filePath: 'entry.ts', distance: 1, relation: 'direct' });
    // mid imports hub → hub is direct upstream
    const hub = impact.upstream.files.find((f) => f.filePath === 'hub.ts');
    expect(hub?.relation).toBe('direct');
    expect(hub?.distance).toBe(1);
  });
});
