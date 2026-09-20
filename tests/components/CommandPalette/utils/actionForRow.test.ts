import { describe, it, expect } from 'vitest';
import { actionForRow } from '../../../../src/components/CommandPalette/utils/actionForRow';
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
  pgc: 42038,
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

describe('actionForRow', () => {
  it('an alias row → the shared galaxy-id ladder pgc- rung', () => {
    expect(actionForRow({ kind: 'alias', entry: NGC4565, score: 0 })).toEqual({
      kind: 'focus',
      focusId: 'pgc-42038',
    });
  });

  it('a structure row → its own durable category-prefixed id, verbatim', () => {
    expect(actionForRow({ kind: 'structure', entry: COMA, score: 0 })).toEqual({
      kind: 'focus',
      focusId: 'cluster-coma',
    });
  });
});
