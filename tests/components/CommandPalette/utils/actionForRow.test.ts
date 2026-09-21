import { describe, it, expect } from 'vitest';
import { actionForRow } from '../../../../src/components/CommandPalette/utils/actionForRow';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { Source } from '../../../../src/data/sources';
import { MILKY_WAY_FOCUS_ID } from '../../../../src/services/url/milkyWayFocusId';
import { exhibitRegistry } from '../../../../src/data/exhibits/exhibitRegistry';
import { tourRegistry } from '../../../../src/data/animation/tours/tourRegistry';
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
  it('a famous row → its curated seed id', () => {
    expect(actionForRow({ kind: 'famous', entry: M31, score: 0 })).toEqual({
      kind: 'focus',
      focusId: 'm31',
    });
  });

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

  it('the milkyWay row → the fixed singleton focus id', () => {
    expect(actionForRow({ kind: 'milkyWay', score: 0 })).toEqual({
      kind: 'focus',
      focusId: MILKY_WAY_FOCUS_ID,
    });
  });

  it('a body row → the seed id under the body focus prefix', () => {
    expect(actionForRow({ kind: 'body', body: SCENE_EARTH, score: 0 })).toEqual({
      kind: 'focus',
      focusId: `body-${SCENE_EARTH.id}`,
    });
  });

  it('an exhibit row → an exhibit action carrying the registry id, not a focus', () => {
    const exhibit = exhibitRegistry.cosmicWeb;
    expect(actionForRow({ kind: 'exhibit', exhibit, score: 0 })).toEqual({
      kind: 'exhibit',
      exhibitId: exhibit.id,
    });
  });

  it('a tour row → a tour action carrying the registry id, not a focus', () => {
    const tour = tourRegistry.grandTour;
    expect(actionForRow({ kind: 'tour', tour, score: 0 })).toEqual({
      kind: 'tour',
      tourId: tour.id,
    });
  });
});
