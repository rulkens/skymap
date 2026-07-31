import { describe, it, expect } from 'vitest';
import { glidePath } from '../../../src/utils/camera/glidePath';
import { GLIDE_MIN_SEC, GLIDE_MAX_SEC } from '../../../src/utils/camera/glideCalibration';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const FOV_Y = (50 * Math.PI) / 180;

/** Absolute when the target is 0, relative otherwise — mirrors zoomPanGeodesic.test.ts. */
function relErr(got: number, want: number): number {
  return want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
}

describe('glidePath', () => {
  it('at(0) and at(1) reproduce from and to', () => {
    const cases: readonly [
      string,
      { target: Vec3; distance: number },
      { target: Vec3; distance: number },
    ][] = [
      ['pan + zoom', { target: [0, 0, 0], distance: 10 }, { target: [30, 40, 0], distance: 5 }],
      // Pure zoom: du === 0, the geodesic's degenerate branch.
      ['pure zoom', { target: [5, 5, 5], distance: 1000 }, { target: [5, 5, 5], distance: 1 }],
      // Earth-surface scale (~1e-16 Mpc), the low end of the 19-decade range.
      [
        'Earth-surface scale',
        { target: [0, 0, 0], distance: 2e-16 },
        { target: [3e-16, 0, 0], distance: 4e-16 },
      ],
    ];
    for (const [name, from, to] of cases) {
      const g = glidePath(from, to, FOV_Y);
      const start = g.at(0);
      const end = g.at(1);
      expect(start.target, name).toEqual(from.target);
      expect(relErr(start.distance, from.distance), name).toBeLessThanOrEqual(1e-9);
      const [ex, ey, ez] = end.target;
      const [tx, ty, tz] = to.target;
      expect(relErr(ex, tx), name).toBeLessThanOrEqual(1e-6);
      expect(relErr(ey, ty), name).toBeLessThanOrEqual(1e-6);
      expect(relErr(ez, tz), name).toBeLessThanOrEqual(1e-6);
      expect(relErr(end.distance, to.distance), name).toBeLessThanOrEqual(1e-9);
    }
  });

  it('the target path is a straight line', () => {
    const from = { target: [0, 0, 0] as Vec3, distance: 10 };
    const to = { target: [30, 40, 0] as Vec3, distance: 5 };
    const g = glidePath(from, to, FOV_Y);

    const seg: Vec3 = [
      to.target[0] - from.target[0],
      to.target[1] - from.target[1],
      to.target[2] - from.target[2],
    ];
    const segLen = Math.hypot(seg[0], seg[1], seg[2]);
    const dir: Vec3 = [seg[0] / segLen, seg[1] / segLen, seg[2] / segLen];

    let previousProjection = -Infinity;
    for (const arcFrac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const { target } = g.at(arcFrac);
      const v: Vec3 = [
        target[0] - from.target[0],
        target[1] - from.target[1],
        target[2] - from.target[2],
      ];
      const cross: Vec3 = [
        v[1] * dir[2] - v[2] * dir[1],
        v[2] * dir[0] - v[0] * dir[2],
        v[0] * dir[1] - v[1] * dir[0],
      ];
      expect(Math.hypot(...cross)).toBeLessThan(1e-9 * segLen);

      const projection = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
      expect(projection).toBeGreaterThan(previousProjection);
      previousProjection = projection;
    }
  });

  it('w uses the FOV, not the raw distance', () => {
    const from = { target: [0, 0, 0] as Vec3, distance: 10 };
    const to = { target: [30, 40, 0] as Vec3, distance: 5 };
    const narrow = glidePath(from, to, (20 * Math.PI) / 180);
    const wide = glidePath(from, to, (100 * Math.PI) / 180);

    // Probe the PATH, not the duration: the duration clamp can pin two
    // different FOVs to the same bound and blind this test entirely — it did,
    // at the calibration this shipped with. The mid-arc pose cannot be clamped.
    expect(narrow.at(0.5).distance).not.toBeCloseTo(wide.at(0.5).distance, 6);
  });

  it('duration is clamped at both ends', () => {
    // Earth-orbit scale to observable-universe scale: unclamped S/V is tens of
    // seconds, far past GLIDE_MAX_SEC.
    const huge = glidePath(
      { target: [0, 0, 0], distance: 4.3e-14 },
      { target: [3000, 4000, 0], distance: 4000 },
      FOV_Y,
    );
    expect(huge.durationSec).toBe(GLIDE_MAX_SEC);

    // A sub-pixel target nudge at unchanged distance: unclamped S/V is many
    // orders of magnitude below GLIDE_MIN_SEC.
    const tiny = glidePath(
      { target: [0, 0, 0], distance: 10 },
      { target: [1e-15, 0, 0], distance: 10 },
      FOV_Y,
    );
    expect(tiny.durationSec).toBe(GLIDE_MIN_SEC);
  });
});
