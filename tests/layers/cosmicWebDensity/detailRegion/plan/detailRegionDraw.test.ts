import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { DetailRegionGeometry } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionGeometry';
import type { DetailRegionState } from '../../../../../src/layers/cosmicWebDensity/detailRegion/@types/DetailRegionState';
import { detailRegionDraw } from '../../../../../src/layers/cosmicWebDensity/detailRegion/plan/detailRegionDraw';

// MCPM's dataBox at K = 5.
const MCPM: DetailRegionGeometry = { dims: [672, 1152, 648], bricksPerAxis: 5, voxelMpc: 0.78 };
const box = (lo: Vec3, hi: Vec3) => ({ lo, hi });
const STATE: DetailRegionState = {
  target: box([0, 0, 0], [5, 5, 5]),
  settled: box([1, 1, 1], [3, 3, 3]),
  fade: null,
  inReach: true,
};

describe('detailRegionDraw', () => {
  it('boxes map to local [0,1]³ with the settled box inset half a native voxel', () => {
    const draw = detailRegionDraw(STATE, MCPM)!;
    expect(draw.settledLo[0]).toBeCloseTo((48 + 0.5) / 672, 9);
    expect(draw.settledHi[0]).toBeCloseTo((144 - 0.5) / 672, 9);
    expect(draw.settledHi[1]).toBeCloseTo((144 - 0.5) / 1152, 9);
    expect(draw.voxelMpc).toBe(0.78);
    expect(draw.fade).toBeNull();
  });

  it('texScale is the dims over K bricks of 48', () => {
    const [x, y, z] = detailRegionDraw(STATE, MCPM)!.texScale;
    expect([x, y, z].map((v) => +v.toFixed(9))).toEqual([2.8, 4.8, 2.7]);
  });

  it('out of reach or with nothing settled draws null', () => {
    expect(detailRegionDraw({ ...STATE, inReach: false }, MCPM)).toBeNull();
    expect(detailRegionDraw({ ...STATE, settled: null }, MCPM)).toBeNull();
  });

  it('a first fill draws its fade around an empty settled box, no box inverted by the inset', () => {
    const into = box([1, 1, 1], [3, 3, 3]);
    const empty = box([0, 0, 0], [0, 0, 0]);
    const draw = detailRegionDraw(
      { ...STATE, settled: null, fade: { into, out: empty, w: 0.25 } },
      MCPM,
    )!;
    expect(draw.settledLo).toEqual(draw.settledHi);
    expect(draw.fade!.outLo).toEqual(draw.fade!.outHi);
    expect(draw.fade!.intoLo[0]).toBeCloseTo((48 + 0.5) / 672, 9);
    expect(draw.fade!.w).toBe(0.25);
  });
});
