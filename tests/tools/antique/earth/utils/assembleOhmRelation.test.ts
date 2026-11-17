/**
 * OHM boundaries arrive as loose member ways: a ring split over several ways
 * must still close into a face, and inner ways must cut holes. mapshaper's
 * -polygons output carries no attribute table, which once crashed the dissolve.
 */

import { describe, it, expect } from 'vitest';

import type { OhmElement } from '../../../../../tools/antique/earth/@types/OhmElement';
import { assembleOhmRelation } from '../../../../../tools/antique/earth/utils/assembleOhmRelation';

type Way = Extract<OhmElement, { type: 'way' }>;

const way = (id: number, points: [number, number][]): Way => ({
  type: 'way',
  id,
  version: 1,
  geometry: points.map(([lon, lat]) => ({ lon, lat })),
});

const WAYS = new Map<number, Way>([
  [
    1,
    way(1, [
      [0, 0],
      [4, 0],
      [4, 4],
    ]),
  ],
  [
    2,
    way(2, [
      [4, 4],
      [0, 4],
      [0, 0],
    ]),
  ],
  [
    3,
    way(3, [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ]),
  ],
]);

const relation = (members: [number, string][]): Extract<OhmElement, { type: 'relation' }> => ({
  type: 'relation',
  id: 9,
  version: 1,
  members: members.map(([ref, role]) => ({ type: 'way', ref, role })),
});

describe('assembleOhmRelation', () => {
  it('closes a ring split over two outer ways into one face', async () => {
    const polygons = await assembleOhmRelation(
      relation([
        [1, 'outer'],
        [2, 'outer'],
      ]),
      WAYS,
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(1);
  });

  it('cuts an inner way out as a hole', async () => {
    const polygons = await assembleOhmRelation(
      relation([
        [1, 'outer'],
        [2, 'outer'],
        [3, 'inner'],
      ]),
      WAYS,
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
  });
});
