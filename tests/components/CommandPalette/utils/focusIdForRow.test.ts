import { describe, it, expect } from 'vitest';
import { focusIdForRow } from '../../../../src/components/CommandPalette/utils/focusIdForRow';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { Source } from '../../../../src/data/sources';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../../src/@types/engine/StructureSearchEntry';

const M31: FamousGalaxyMetaEntry = {
  id: 'm31',
  names: ['M31', 'Andromeda Galaxy'],
  description: '',
  type: 'Sb',
};

const NGC4565: AliasIndexEntry = {
  pgc: 42038n,
  names: ['NGC 4565'],
  source: Source.Glade,
  localIdx: 7,
};

const COMA: StructureSearchEntry = {
  id: 'cluster-coma',
  name: 'Coma Cluster',
  category: 'cluster',
  abell: 'A1656',
  description: '',
};

describe('focusIdForRow', () => {
  it('a famous row → its curated seed id', () => {
    expect(focusIdForRow({ kind: 'famous', entry: M31, score: 0 })).toBe('m31');
  });

  it('an alias row → the shared galaxy-id ladder pgc- rung', () => {
    expect(focusIdForRow({ kind: 'alias', entry: NGC4565, score: 0 })).toBe('pgc-42038');
  });

  it('a structure row → its own durable category-prefixed id, verbatim', () => {
    expect(focusIdForRow({ kind: 'structure', entry: COMA, score: 0 })).toBe('cluster-coma');
  });

  it('the Milky Way row → the durable singleton focus id', () => {
    expect(focusIdForRow({ kind: 'milkyWay', score: 0 })).toBe('milkyWay');
  });

  it('a scene-body row → its seed id under the body- prefix', () => {
    expect(focusIdForRow({ kind: 'body', body: SCENE_EARTH, score: 0 })).toBe('body-earth');
  });
});
