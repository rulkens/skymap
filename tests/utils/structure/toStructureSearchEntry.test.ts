import { describe, it, expect } from 'vitest';
import { toStructureSearchEntry } from '../../../src/utils/structure/toStructureSearchEntry';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';

const cluster: StructureInfo = {
  type: 'structure',
  id: 'cluster-coma',
  name: 'Coma Cluster',
  category: 'cluster',
  abell: 'A1656',
  worldPos: [1, 2, 3],
  featured: true,
  description: 'The nearest rich cluster.',
  physicalRadiusMpc: 2,
};

const supercluster: StructureInfo = {
  type: 'structure',
  id: 'supercluster-shapley',
  name: 'Shapley Supercluster',
  category: 'supercluster',
  worldPos: [4, 5, 6],
  featured: true,
  physicalRadiusMpc: 30,
};

describe('toStructureSearchEntry', () => {
  it('projects a cluster to the lean search entry, keeping its Abell number', () => {
    expect(toStructureSearchEntry(cluster)).toEqual({
      id: 'cluster-coma',
      name: 'Coma Cluster',
      category: 'cluster',
      abell: 'A1656',
      description: 'The nearest rich cluster.',
    });
  });

  it('reports abell as null for a non-cluster and an empty description when absent', () => {
    expect(toStructureSearchEntry(supercluster)).toEqual({
      id: 'supercluster-shapley',
      name: 'Shapley Supercluster',
      category: 'supercluster',
      abell: null,
      description: '',
    });
  });
});
