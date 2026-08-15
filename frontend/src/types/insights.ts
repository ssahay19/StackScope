/**
 * Mirror of architecture insights types from
 * `backend/src/services/architectureInsightsService.ts`.
 * Keep in sync when adding fields.
 */

import type { NodeCategory } from './parsing';

export interface RankedFile {
  filePath: string;
  dependents: number;
}

export interface HubFile {
  filePath: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
}

export interface EntryPointFile {
  filePath: string;
  outDegree: number;
}

export interface OrphanFile {
  filePath: string;
  language: string;
  languageSupported: boolean;
  category: NodeCategory;
}

export interface CircularChain {
  id: string;
  files: string[];
}

export interface DependencyDepth {
  maxDepth: number;
  deepestPath: string[];
}

export interface ModuleGroup {
  folder: string;
  fileCount: number;
  internalEdges: number;
  outboundCrossEdges: number;
  inboundCrossEdges: number;
}

export interface ArchitectureInsightsSummary {
  totalFiles: number;
  totalDependencies: number;
  circularChainCount: number;
  rootCount: number;
  orphanCount: number;
}

export interface ArchitectureInsights {
  summary: ArchitectureInsightsSummary;
  mostDependedOn: RankedFile[];
  hubs: HubFile[];
  entryPoints: EntryPointFile[];
  orphans: OrphanFile[];
  circularChains: CircularChain[];
  dependencyDepth: DependencyDepth;
  moduleGroups: ModuleGroup[];
}
