/**
 * Mirror of `backend/src/types/repository.ts`.
 * Keep these two files identical in shape. If a field is added on either side,
 * update the other in the same commit.
 */

export type NodeType = 'file' | 'folder';

export interface TreeNode {
  name: string;
  path: string;
  type: NodeType;
  size?: number;
  extension?: string;
  children?: TreeNode[];
}

export interface LanguageStat {
  name: string;
  fileCount: number;
  percent: number;
}

export interface DependencySummary {
  totalNodes: number;
  totalEdges: number;
  filesParsed: number;
  filesSkipped: number;
  filesFailed: number;
  circularDependencies: number;
}

export interface RepositoryAnalysis {
  id: string;
  name: string;
  owner: string;
  language: string;
  totalFiles: number;
  totalFolders: number;
  languages: LanguageStat[];
  tree: TreeNode;
  analyzedAt: string;
  dependencySummary: DependencySummary;
}

export interface ApiError {
  code: string;
  message: string;
}
