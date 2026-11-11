import { describe, it, expect } from 'vitest';
import { actionForRow } from '../../../src/utils/palette/actionForRow';
import { APP_EXHIBIT_REGISTRY } from '../../../src/compositions/appExhibits';
import { APP_TOUR_REGISTRY } from '../../../src/compositions/appTours';
import type { FamousGalaxyMetaEntry } from '../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../src/@types/engine/StructureSearchEntry';
import type { EarthPlace } from '../../../src/@types/palette/EarthPlace';

const M31: FamousGalaxyMetaEntry = {
  id: 'm31',
  names: ['M31', 'Andromeda Galaxy'],
  description: '',
  type: 'Sb',
};

const NGC4565: AliasIndexEntry = {
  pgc: 42038,
  names: ['NGC 4565'],
  sourceLabel: 'GLADE',
  focusId: 'pgc-42038',
};

const COMA: StructureSearchEntry = {
  id: 'cluster-coma',
  name: 'Coma Cluster',
  category: 'galaxy-cluster',
  abell: 'A1656',
  description: '',
  featured: true,
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

  it('an exhibit row → an exhibit action carrying the registry id, not a focus', () => {
    const exhibit = APP_EXHIBIT_REGISTRY.cosmicWeb;
    expect(actionForRow({ kind: 'exhibit', exhibit, score: 0 })).toEqual({
      kind: 'exhibit',
      exhibitId: exhibit.id,
    });
  });

  it('a tour row → a tour action carrying the registry id, not a focus', () => {
    const tour = APP_TOUR_REGISTRY.grandTour;
    expect(actionForRow({ kind: 'tour', tour, score: 0 })).toEqual({
      kind: 'tour',
      tourId: tour.id,
    });
  });

  it('a place row → a flyTo action with its lon/lat/alt, verbatim', () => {
    const GIZA: EarthPlace = {
      id: 'giza',
      names: ['Giza', 'Pyramids of Giza'],
      lonDeg: 31.1342,
      latDeg: 29.9792,
      altKm: 3,
    };
    expect(actionForRow({ kind: 'place', entry: GIZA, score: 0 })).toEqual({
      kind: 'flyTo',
      lonDeg: 31.1342,
      latDeg: 29.9792,
      altKm: 3,
    });
  });
});
