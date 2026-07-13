/**
 * labelLeaderLine — screen-space leader-line geometry.
 *
 * The whole point of the helper is orientation-independence: the returned
 * `toWorld` must project to exactly `liftPx` straight up from the dot at ANY
 * camera pose. So the tests project both returned endpoints through the SAME
 * vp and assert the screen relationship — and crucially assert it for a
 * ROLLED / TILTED vp, the pose where a naive world `+Y` offset would tilt or
 * foreshorten the connector (the reported "over the text" / "too short" bugs).
 */

import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { labelLeaderLine } from '../../../src/utils/camera/labelLeaderLine';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** Project a world point through vp to screen pixels (screen +Y down). */
function projectToScreen(vp: Float32Array, p: Vec3, viewportPx: Vec2): Vec2 {
  const clipX = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
  const clipY = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
  const clipW = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return [(ndcX * 0.5 + 0.5) * viewportPx[0], (1 - (ndcY * 0.5 + 0.5)) * viewportPx[1]];
}

/** A perspective·lookAt vp, optionally with a tilted up-vector (roll). */
function makeVp(up: Vec3): Float32Array {
  const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = mat4.lookAt([0, 0, 5], [0, 0, 0], up);
  return mat4.multiply(proj, view) as Float32Array;
}

const VIEWPORT: Vec2 = [1000, 800];
const LIFT_PX = 40;

describe('labelLeaderLine', () => {
  it('lifts straight up in screen space', () => {
    // An anchor off-axis so a world +Y offset would visibly misbehave, tested
    // against both an upright and a rolled/tilted vp. In BOTH the connector
    // must be perfectly vertical on screen and exactly LIFT_PX long.
    const anchor: Vec3 = [1.2, -0.7, 0.3];
    for (const up of [
      [0, 1, 0] as Vec3, // upright
      [Math.sin(0.6), Math.cos(0.6), 0] as Vec3, // rolled ~34°
    ]) {
      const vp = makeVp(up);
      const res = labelLeaderLine({
        anchorWorldPos: anchor,
        vp,
        viewportPx: VIEWPORT,
        liftPx: LIFT_PX,
      });
      expect(res).not.toBeNull();
      const from = projectToScreen(vp, res!.fromWorld, VIEWPORT);
      const to = projectToScreen(vp, res!.toWorld, VIEWPORT);
      // Same screen-x (vertical connector) regardless of camera roll, and the
      // tip exactly LIFT_PX pixels ABOVE the dot (screen +Y down). Precision 2
      // (±0.005 px): the vp is f32, so the project→un-project→project round
      // trip carries ~1e-3 px of rounding — far below anything visible.
      expect(to[0]).toBeCloseTo(from[0], 2);
      expect(from[1] - to[1]).toBeCloseTo(LIFT_PX, 2);
      // fromWorld is the untouched anchor.
      expect(res!.fromWorld).toEqual([anchor[0], anchor[1], anchor[2]]);
    }
  });

  it('returns null behind the camera', () => {
    // Camera at z=5 looking toward the origin down -Z; a point BEHIND the
    // camera (z=10) has clip-w <= 0 and yields no leader line.
    const vp = makeVp([0, 1, 0]);
    const behind: Vec3 = [0, 0, 10];
    expect(
      labelLeaderLine({ anchorWorldPos: behind, vp, viewportPx: VIEWPORT, liftPx: LIFT_PX }),
    ).toBeNull();
  });
});
