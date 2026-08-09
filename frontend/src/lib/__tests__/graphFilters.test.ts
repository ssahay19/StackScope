import { describe, expect, it } from 'vitest';
import {
  collectAvailableFolders,
  collectAvailableLanguages,
  filterGraph,
  findSearchMatches,
  isNodeVisible,
} from '../graphFilters';
import { findFilesInCycles } from '../graphCycles';
import { emptyFilters, type GraphFilters } from '../../components/graph/GraphToolbar';
import { fixture } from '../../__tests__/fixtures';

const nodeByPath = (path: string) => fixture.nodes.find((n) => n.filePath === path)!;
const filters = (partial: Partial<GraphFilters> = {}): GraphFilters => ({ ...emptyFilters(), ...partial });

describe('graphFilters — isNodeVisible', () => {
  const cycleFiles = findFilesInCycles(fixture);

  it('shows all nodes with the default filter', () => {
    const f = filters();
    for (const n of fixture.nodes) {
      expect(isNodeVisible(n, f, cycleFiles)).toBe(true);
    }
  });

  it('hides test files when hideTests is on', () => {
    const f = filters({ hideTests: true });
    expect(isNodeVisible(nodeByPath('src/auth.test.ts'), f, cycleFiles)).toBe(false);
    expect(isNodeVisible(nodeByPath('src/auth.ts'), f, cycleFiles)).toBe(true);
  });

  it('hides config files when hideConfig is on', () => {
    const f = filters({ hideConfig: true });
    expect(isNodeVisible(nodeByPath('tsconfig.json'), f, cycleFiles)).toBe(false);
    expect(isNodeVisible(nodeByPath('README.md'), f, cycleFiles)).toBe(true);
  });

  it('respects the language chip', () => {
    const f = filters({ languages: new Set(['TypeScript']) });
    expect(isNodeVisible(nodeByPath('src/auth.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('README.md'), f, cycleFiles)).toBe(false);
  });

  it('respects the folder chip', () => {
    const f = filters({ folders: new Set(['src']) });
    expect(isNodeVisible(nodeByPath('src/auth.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('tsconfig.json'), f, cycleFiles)).toBe(false);
  });

  it('onlyWithImports keeps only files that import something', () => {
    const f = filters({ onlyWithImports: true });
    expect(isNodeVisible(nodeByPath('src/index.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('src/utils.ts'), f, cycleFiles)).toBe(false); // no imports
  });

  it('onlyRoots keeps only files with no incoming imports', () => {
    const f = filters({ onlyRoots: true });
    expect(isNodeVisible(nodeByPath('src/index.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('src/utils.ts'), f, cycleFiles)).toBe(false);
  });

  it('onlyCircular keeps only files in cycles', () => {
    const f = filters({ onlyCircular: true });
    expect(isNodeVisible(nodeByPath('src/cycle-a.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('src/cycle-b.ts'), f, cycleFiles)).toBe(true);
    expect(isNodeVisible(nodeByPath('src/index.ts'), f, cycleFiles)).toBe(false);
  });
});

describe('graphFilters — filterGraph', () => {
  const cycleFiles = findFilesInCycles(fixture);

  it('keeps edges only when both endpoints remain visible', () => {
    // Hide config and tests — src/auth.test.ts should be dropped.
    const { visiblePaths } = filterGraph(fixture, {
      filters: filters({ hideTests: true }),
      filesInCycles: cycleFiles,
    });
    expect(visiblePaths.has('src/auth.test.ts')).toBe(false);
    expect(visiblePaths.has('src/auth.ts')).toBe(true);
  });
});

describe('graphFilters — findSearchMatches', () => {
  it('matches by filename substring', () => {
    const matches = findSearchMatches(fixture.nodes, 'auth');
    expect(matches.has('src/auth.ts')).toBe(true);
    expect(matches.has('src/auth.test.ts')).toBe(true);
    expect(matches.has('src/utils.ts')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(findSearchMatches(fixture.nodes, 'AUTH').size).toBe(2);
  });

  it('returns empty when the query is empty', () => {
    expect(findSearchMatches(fixture.nodes, '').size).toBe(0);
    expect(findSearchMatches(fixture.nodes, '   ').size).toBe(0);
  });

  it('matches folder segments too', () => {
    expect(findSearchMatches(fixture.nodes, 'cycle').size).toBe(2);
  });
});

describe('graphFilters — availability helpers', () => {
  it('lists languages present in the graph', () => {
    const langs = collectAvailableLanguages(fixture);
    expect(langs).toContain('TypeScript');
    expect(langs).toContain('MD');
    expect(langs).toContain('JSON');
  });

  it('lists top-level folders', () => {
    const folders = collectAvailableFolders(fixture);
    expect(folders).toContain('src');
    expect(folders).toContain(''); // root
  });
});
