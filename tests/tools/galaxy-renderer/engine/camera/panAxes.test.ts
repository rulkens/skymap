/**
 * panAxes — the screen-space right/up basis for orbit-camera panning,
 * extracted from galaxy-engine.js:231-234. Verifies the pair stays
 * orthonormal and horizontal across azimuth/elevation, matching the
 * "drag shifts the target along the camera's own axes" behaviour the
 * spike relies on.
 */
import { describe, expect, it } from 'vitest';
import { panAxes } from '../../../../../tools/galaxy-renderer/src/engine/camera/panAxes';

const PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.3, 0.9],
  [Math.PI, -1.1],
  [-2.4, 1.4],
  [5.9, 1.5],
];

describe('panAxes', () => {
  it('right is horizontal', () => {
    for (const [az, el] of PROBES) {
      const { right } = panAxes(az, el);
      expect(right[1]).toBe(0);
    }
  });

  it('at el=0 up is +Y', () => {
    const { up } = panAxes(1.2, 0);
    expect(up[0]).toBeCloseTo(0, 12);
    expect(up[1]).toBeCloseTo(1, 12);
    expect(up[2]).toBeCloseTo(0, 12);
  });
});
