/**
 * Mirror of `backend/src/types/parsing.ts`.
 * Keep these in sync when adding fields.
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
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  location: SymbolLocation;
  exported: boolean;
}

export interface ImportRef {
  source: string;
  resolvedPath: string | null;
  importedNames: string[];
  isTypeOnly: boolean;
  kind: 'import' | 'require' | 'reexport';
}

export type SkipReason =
  | 'unsupported-language'
  | 'too-large'
  | 'minified'
  | 'ignored-path'
  | 'read-error';

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
  imports: ImportRef[];
  importedBy: string[];
  symbols: CodeSymbol[];
  parseError: string | null;
  skipped: boolean;
  skipReason: SkipReason | null;

  category: NodeCategory;
  extension: string | null;
  folder: string;
  symbolCount: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

/** The response body for `GET /api/repository/:id/file/*`. */
export type FileInspectorResponse = DependencyNode;
