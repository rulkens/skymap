/**
 * A river's pieces join into one strip running source → mouth whatever their
 * digitised direction, a confluence keeps its branches apart, and a stem
 * numbered anew below a confluence inherits the longest feeder's length, so
 * its width taper carries on instead of restarting thin.
 */

import { describe, it, expect } from 'vitest';

import { buildRiverChains } from '../../../../../tools/antique/earth/utils/buildRiverChains';
import type { RiverPiece } from '../../../../../tools/antique/earth/@types/RiverPiece';
import { riverWidthUnits } from '../../../../../tools/antique/earth/utils/riverWidthUnits';

const R = 6371;
const DEG_KM = (Math.PI / 180) * R;
const piece = (key: string, points: [number, number][]): RiverPiece => ({
  key,
  scalerank: 3,
  minZoom: 5,
  points,
});
// Ground falls eastwards: the east end of anything is its mouth.
const elevationAt = (lonDeg: number) => 1000 - lonDeg * 100;

describe('buildRiverChains', () => {
  it('chains a river digitised in mixed directions into one strip from its high end', () => {
    const chains = buildRiverChains(
      [
        piece('a', [
          [2, 0],
          [1, 0],
        ]),
        piece('a', [
          [2, 0],
          [3, 0],
        ]),
        piece('a', [
          [0, 0],
          [1, 0],
        ]),
      ],
      elevationAt,
      R,
    );
    expect(chains).toHaveLength(1);
    expect(chains[0]!.points).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(chains[0]!.lengthKm).toBeCloseTo(3 * DEG_KM, 6);
    expect(chains[0]!.upstreamKm).toBe(0);
  });

  it('keeps a confluence’s branches apart and credits the stem below with the longest feeder', () => {
    const chains = buildRiverChains(
      [
        piece('r', [
          [0, 0],
          [2, 0],
        ]),
        piece('r', [
          [1, 1],
          [2, 0],
        ]),
        piece('r', [
          [3, 0],
          [2, 0],
        ]),
      ],
      elevationAt,
      R,
    );
    expect(chains).toHaveLength(3);
    const stem = chains.find((c) => c.points[0]![0] === 2)!;
    expect(stem.points).toEqual([
      [2, 0],
      [3, 0],
    ]);
    expect(stem.upstreamKm).toBeCloseTo(2 * DEG_KM, 6);
  });

  it('tapers a river from 30 % of its rank width at the source to all of it 250 km down', () => {
    expect(riverWidthUnits(3, 0)).toBeCloseTo(0.3 * 1.5, 9);
    expect(riverWidthUnits(3, 250)).toBeCloseTo(1.5, 9);
  });
});
