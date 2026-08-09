import type { DependencyGraph, DependencyNode } from '../types/parsing';
import type { GraphFilters } from '../components/graph/GraphToolbar';
import { topLevelFolder, basename } from './paths';

/**
 * Pure visibility computation.
 *
 * A node passes the filters when every enabled filter accepts it. An empty
 * `languages`/`folders` set means "no restriction" — not "reject all".
 *
 * The search box does NOT change visibility here; it drives highlighting.
 * That mirrors the spec: "Typing 'auth' highlights auth.ts, authentication.ts,
 * authMiddleware.ts. Automatically centers the graph." — matches are shown
 * *and* everything else stays visible for context.
 */

export const isNodeVisible = (
  node: DependencyNode,
  filters: GraphFilters,
  filesInCycles: Set<string>,
): boolean => {
  if (filters.hideTests && node.category === 'test') return false;
  if (filters.hideConfig && node.category === 'config') return false;

  if (filters.categories.size > 0 && !filters.categories.has(node.category)) return false;
  if (filters.languages.size > 0 && !filters.languages.has(node.language)) return false;

  if (filters.folders.size > 0) {
    const folder = topLevelFolder(node.filePath);
    if (!filters.folders.has(folder)) return false;
  }

  if (filters.onlyWithImports && node.imports.length === 0) return false;
  if (filters.onlyRoots && node.importedBy.length > 0) return false;
  if (filters.onlyCircular && !filesInCycles.has(node.filePath)) return false;

  return true;
};

export interface FilterOptions {
  filters: GraphFilters;
  filesInCycles: Set<string>;
}

export const filterGraph = (
  graph: DependencyGraph,
  options: FilterOptions,
): { visibleNodes: DependencyNode[]; visiblePaths: Set<string> } => {
  const visibleNodes = graph.nodes.filter((n) => isNodeVisible(n, options.filters, options.filesInCycles));
  return {
    visibleNodes,
    visiblePaths: new Set(visibleNodes.map((n) => n.filePath)),
  };
};

/**
 * Case-insensitive substring match against filename and full path.
 * Used to compute which nodes get the "match" highlight state.
 */
export const findSearchMatches = (
  nodes: DependencyNode[],
  query: string,
): Set<string> => {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return new Set();
  const matches = new Set<string>();
  for (const n of nodes) {
    if (
      basename(n.filePath).toLowerCase().includes(q) ||
      n.filePath.toLowerCase().includes(q)
    ) {
      matches.add(n.filePath);
    }
  }
  return matches;
};

/**
 * Distinct languages present in the graph, sorted alphabetically.
 * Falls back to friendly names for skipped files whose language is `Unknown`.
 */
export const collectAvailableLanguages = (graph: DependencyGraph): string[] => {
  const set = new Set<string>();
  for (const n of graph.nodes) set.add(n.language);
  return Array.from(set).sort();
};

export const collectAvailableFolders = (graph: DependencyGraph): string[] => {
  const set = new Set<string>();
  for (const n of graph.nodes) set.add(topLevelFolder(n.filePath));
  return Array.from(set).sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });
};
