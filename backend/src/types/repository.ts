/**
 * Shared repository DTO contract.
 *
 * This file is the single source of truth on the backend. The frontend
 * keeps a manual mirror at `frontend/src/types/repository.ts` — the two
 * must stay in sync.
 */

export type NodeType = 'file' | 'folder';

export interface TreeNode {
  name: string;
  path: string; // repo-relative, POSIX-style
  type: NodeType;
  size?: number;
  extension?: string; // lowercase, no leading dot
  children?: TreeNode[];
}

export interface LanguageStat {
  name: string;
  fileCount: number;
  percent: number; // 0..100, one decimal
}

/**
 * The scanner's output: a scan-only analysis with no parser data yet.
 * `analysisService` combines this with parser results into a `RepositoryAnalysis`.
 */
export interface RepositoryScan {
  name: string;
  owner: string;
  language: string; // primary
  totalFiles: number;
  totalFolders: number;
  languages: LanguageStat[];
  tree: TreeNode;
  analyzedAt: string; // ISO
}

/**
 * The full analysis DTO returned by POST /api/analyze in Phase 2.
 * Extends the scan with a server-generated id and the dependency summary.
 */
export interface RepositoryAnalysis extends RepositoryScan {
  id: string;
  dependencySummary: DependencySummary;
}

export interface DependencySummary {
  totalNodes: number;
  totalEdges: number;
  filesParsed: number;
  filesSkipped: number;
  filesFailed: number;
  circularDependencies: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
