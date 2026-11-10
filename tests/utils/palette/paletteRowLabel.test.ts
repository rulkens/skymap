import { describe, expect, it } from 'vitest';

import { paletteRowLabel } from '../../../src/utils/palette/paletteRowLabel';
import { APP_EXHIBIT_REGISTRY } from '../../../src/compositions/appExhibits';
import { APP_TOUR_REGISTRY } from '../../../src/compositions/appTours';
import type { ScoredRow } from '../../../src/@types/palette/ScoredRow';

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
      [
        {
          kind: 'alias',
          entry: { pgc: 42038, names: ['NGC 4565'], sourceLabel: 'GLADE', focusId: 'pgc-42038' },
          score: 0,
        },
        'NGC 4565',
        'Galaxy',
      ],
      [
        {
          kind: 'alias',
          entry: { pgc: 1, names: [], sourceLabel: 'GLADE', focusId: 'pgc-1' },
          score: 0,
        },
        '(unnamed)',
        'Galaxy',
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
        { kind: 'exhibit', exhibit: APP_EXHIBIT_REGISTRY.cosmicWeb, score: 0 },
        APP_EXHIBIT_REGISTRY.cosmicWeb.label,
        'Exhibit',
      ],
      [
        { kind: 'tour', tour: APP_TOUR_REGISTRY.grandTour, score: 0 },
        APP_TOUR_REGISTRY.grandTour.label,
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
      [
        {
          kind: 'layer',
          entry: { id: 'body-mars', names: ['Mars'], class: 'primary', chip: 'Solar System' },
          score: 0,
        },
        'Mars',
        'Solar System',
      ],
    ];
    for (const [row, name, kind] of cases) expect(paletteRowLabel(row)).toEqual({ name, kind });
  });
});
