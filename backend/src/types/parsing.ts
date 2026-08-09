/**
 * Phase 2 parsing DTOs.
 *
 * These are the deterministic outputs of the parser pipeline. They're kept
 * separate from `repository.ts` so the tree/scan contract stays untouched.
 *
 * The frontend mirrors these types in `frontend/src/types/parsing.ts`.
 */

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'enum'
  | 'type-alias'
  | 'variable'
  | 'constant';

export interface SymbolLocation {
  startLine: number; // 1-based, inclusive
  endLine: number;
  startColumn: number; // 0-based
  endColumn: number;
}

export interface CodeSymbol {
  id: string; // stable: `${filePath}#${kind}:${name}@${startLine}`
  name: string;
  kind: SymbolKind;
  location: SymbolLocation;
  exported: boolean;
}

/** A single import (or require, or re-export) statement in a source file. */
export interface ImportRef {
  /** Raw specifier as written in the source: `./foo`, `react`, `@/lib/x`. */
  source: string;
  /**
   * Repo-relative POSIX path if the specifier resolves to a scanned file,
   * or `null` for external / unresolved specifiers.
   */
  resolvedPath: string | null;
  /**
   * Names brought in. Conventions:
   *   - default import  → 'default'
   *   - namespace       → '*'
   *   - named imports   → their local names
   *   - side-effect     → [] (empty array)
   */
  importedNames: string[];
  isTypeOnly: boolean;
  /** Whether this came from an ESM import, a require() call, or a re-export. */
  kind: 'import' | 'require' | 'reexport';
}

/**
 * The per-file dependency record. Contract fields required by the spec are
 * filePath, imports, importedBy, symbols. We add a few determinate fields
 * (language, languageSupported, parseError) so the frontend can render
 * accurate states without a second API call.
 */
export type NodeCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'documentation'
  | 'data'
  | 'style'
  | 'other';

export interface DependencyNode {
  filePath: string;
  language: string;
  languageSupported: boolean;
  imports: ImportRef[]; // outgoing
  importedBy: string[]; // incoming file paths (populated after graph build)
  symbols: CodeSymbol[];
  parseError: string | null;
  skipped: boolean;
  skipReason: SkipReason | null;

  /** Phase 3 visualization metadata — added for graph rendering. */
  category: NodeCategory;
  extension: string | null;
  folder: string;
  symbolCount: number;
}

export type SkipReason =
  | 'unsupported-language'
  | 'too-large'
  | 'minified'
  | 'ignored-path'
  | 'read-error';

export interface DependencyEdge {
  from: string; // file path
  to: string; // file path
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencySummary {
  totalNodes: number;
  totalEdges: number;
  filesParsed: number;
  filesSkipped: number;
  filesFailed: number;
  circularDependencies: number;
}
