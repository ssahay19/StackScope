/**
 * Change-impact types (Phase 7). Mirror of backend impactService.
 */

export interface ImpactedFile {
  filePath: string;
  distance: number;
  relation: 'direct' | 'transitive';
}

export interface ImpactDirection {
  total: number;
  directCount: number;
  transitiveCount: number;
  maxDistance: number;
  files: ImpactedFile[];
}

export interface FileImpact {
  filePath: string;
  downstream: ImpactDirection;
  upstream: ImpactDirection;
}
