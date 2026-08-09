import { describe, expect, it } from 'vitest';
import { buildNeighborIndex, findFilesInCycles } from '../graphCycles';
import { fixture } from '../../__tests__/fixtures';

describe('graphCycles — findFilesInCycles', () => {
  it('detects a simple two-node cycle in the fixture', () => {
    const cycleFiles = findFilesInCycles(fixture);
    expect(cycleFiles.has('src/cycle-a.ts')).toBe(true);
    expect(cycleFiles.has('src/cycle-b.ts')).toBe(true);
  });

  it('does not flag DAG nodes as circular', () => {
    const cycleFiles = findFilesInCycles(fixture);
    expect(cycleFiles.has('src/index.ts')).toBe(false);
    expect(cycleFiles.has('src/auth.ts')).toBe(false);
    expect(cycleFiles.has('src/utils.ts')).toBe(false);
  });

  it('returns an empty set when there are no cycles', () => {
    const noCycles = {
      nodes: [{ ...fixture.nodes[0]! }, { ...fixture.nodes[1]! }, { ...fixture.nodes[2]! }],
      edges: fixture.edges.filter((e) => !e.from.includes('cycle')),
    };
    expect(findFilesInCycles(noCycles).size).toBe(0);
  });
});

describe('graphCycles — buildNeighborIndex', () => {
  it('produces outgoing and incoming adjacency sets', () => {
    const { outgoing, incoming } = buildNeighborIndex(fixture.edges);
    expect(outgoing.get('src/index.ts')?.has('src/auth.ts')).toBe(true);
    expect(outgoing.get('src/index.ts')?.has('src/utils.ts')).toBe(true);
    expect(incoming.get('src/utils.ts')?.has('src/auth.ts')).toBe(true);
    expect(incoming.get('src/utils.ts')?.has('src/index.ts')).toBe(true);
  });
});
