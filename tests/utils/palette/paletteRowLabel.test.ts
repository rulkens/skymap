import { describe, expect, it } from 'vitest';

import { paletteRowLabel } from '../../../src/utils/palette/paletteRowLabel';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { Source } from '../../../src/data/sources';
import { APP_EXHIBITS } from '../../../src/compositions/appExhibits';
import { tourRegistry } from '../../../src/data/animation/tours/tourRegistry';
import { MILKY_WAY_NAMES } from '../../../src/data/palette/milkyWayNames';
import type { ScoredRow } from '../../../src/@types/palette/ScoredRow';

const siriusIndex = SCENE_STARS.findIndex((star) => star.id === 'sirius');

describe('paletteRowLabel', () => {
  it('names every ScoredRow kind', () => {
    const cases: [ScoredRow, string, string][] = [
      [
        {
          kind: 'famous',
          entry: { id: 'm31', names: ['M31', 'Andromeda'], description: '', type: 'Sb' },
          score: 0,
        },
        'M31',
        'Galaxy',
      ],
      [{ kind: 'milkyWay', score: 0 }, MILKY_WAY_NAMES[0], 'Galaxy'],
      [
        {
          kind: 'alias',
          entry: { pgc: 42038, names: ['NGC 4565'], source: Source.Glade },
          score: 0,
        },
        'NGC 4565',
        'Galaxy',
      ],
      [
        {
          kind: 'alias',
          entry: { pgc: 1, names: [], source: Source.Glade },
          score: 0,
        },
        '(unnamed)',
        'Galaxy',
      ],
      [{ kind: 'body', body: SCENE_EARTH, score: 0 }, SCENE_EARTH.label, 'Object'],
      [
        {
          kind: 'starCatalog',
          source: Source.FamousStar,
          index: siriusIndex,
          star: SCENE_STARS[siriusIndex]!,
          score: 0,
        },
        SCENE_STARS[siriusIndex]!.label,
        'Star',
      ],
      [
        {
          kind: 'structure',
          entry: {
            id: 'cluster-coma',
            name: 'Coma Cluster',
            category: 'galaxy-cluster',
            abell: 'A1656',
            description: '',
            featured: true,
          },
          score: 0,
        },
        'Coma Cluster',
        'Galaxy cluster',
      ],
      [
        { kind: 'exhibit', exhibit: APP_EXHIBITS.cosmicWeb, score: 0 },
        APP_EXHIBITS.cosmicWeb.label,
        'Exhibit',
      ],
      [
        { kind: 'tour', tour: tourRegistry.grandTour, score: 0 },
        tourRegistry.grandTour.label,
        'Tour',
      ],
      [
        {
          kind: 'place',
          entry: { id: 'giza', names: ['Giza', 'Pyramids'], lonDeg: 31, latDeg: 30, altKm: 3 },
          score: 0,
        },
        'Giza',
        'Place',
      ],
      [
        {
          kind: 'layer',
          entry: { id: 'voyager-1', names: ['Voyager 1'], class: 'primary' },
          score: 0,
        },
        'Voyager 1',
        'Object',
      ],
    ];
    for (const [row, name, kind] of cases) expect(paletteRowLabel(row)).toEqual({ name, kind });
  });
});
