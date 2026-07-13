/**
 * liftedLabelPlacement — the line-bottom lift (chain step 6).
 *
 * Load-bearing behaviours:
 *   - With `lineBottomLiftPx` the connector's BOTTOM re-projects to exactly
 *     that many px above the dot — the foreground captions pass apparent
 *     radius + LEADER_LINE_BOTTOM_GAP_PX, so the line ends a constant visible
 *     gap above the body's rim instead of piercing it.
 *   - WITHOUT the input the chain is unchanged: the line starts at the dot,
 *     value-identical — the famous / Milky-Way producers must not move.
 *   - When the raised bottom meets the padded top the line is omitted (a
 *     short lift under a large body can cross) while the caption remains.
 *
 * The lift/clearance/line-top geometry itself is covered through the famous
 * producer's tests and `labelLeaderLine`'s own; these tests pin only the new
 * bottom-lift seam.
 */

import { describe, expect, it } from 'vitest';
import { mat4, mat4d } from 'wgpu-matrix';
import { liftedLabelPlacement } from '../../../../src/services/engine/presentation/liftedLabelPlacement';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

/** Project a world point through vp to screen pixels (screen +Y down). */
function projectToScreen(vp: Float32Array | Float64Array, p: Vec3, viewportPx: Vec2): Vec2 {
  const clipX = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
  const clipY = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
  const clipW = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return [(ndcX * 0.5 + 0.5) * viewportPx[0], (1 - (ndcY * 0.5 + 0.5)) * viewportPx[1]];
}

/** A perspective·lookAt vp — a real projection, not identity, so the px→world
 * un-project is exercised at genuine depth. */
function makeVp(): Float32Array {
  const proj = mat4.perspective(Math.PI / 3, 1, 0.1, 100);
  const view = mat4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  return mat4.multiply(proj, view) as Float32Array;
}

const VIEWPORT: Vec2 = [1000, 800];
const ANCHOR: Vec3 = [1.2, -0.7, 0.3];

/** Shared non-lift inputs: no measured ink (bbox null → ink bottom at the
 * anchor), em/clamps irrelevant to the line-bottom geometry under test. */
function baseInput() {
  return {
    anchorWorldPos: ANCHOR,
    vp: makeVp(),
    viewportPx: VIEWPORT,
    textBbox: null,
    worldEmMpc: 0.001,
    minPixelSize: 13,
    maxPixelSize: 44,
  };
}

describe('liftedLabelPlacement lineBottomLiftPx', () => {
  it('re-projects the line bottom to exactly the requested px above the dot', () => {
    // A 20 px body with the foreground formula: radius (10) + gap (4) = 14 px.
    const bottomLiftPx = 20 / 2 + 4;
    const res = liftedLabelPlacement({
      ...baseInput(),
      subjectSizePx: 20,
      lineBottomLiftPx: bottomLiftPx,
    });
    expect(res).not.toBeNull();
    expect(res!.line).not.toBeNull();
    const vp = makeVp();
    const dot = projectToScreen(vp, ANCHOR, VIEWPORT);
    const bottom = projectToScreen(vp, res!.line!.fromWorld, VIEWPORT);
    // Perfectly vertical (same screen-x) and exactly radius+gap above the dot
    // (screen +Y down). Precision 2: the f32 project→un-project round trip
    // carries ~1e-3 px, far below anything visible.
    expect(bottom[0]).toBeCloseTo(dot[0], 2);
    expect(dot[1] - bottom[1]).toBeCloseTo(bottomLiftPx, 2);
  });

  it('leaves the famous/Milky-Way path (no bottom lift) at the dot', () => {
    const res = liftedLabelPlacement({ ...baseInput(), subjectSizePx: 20 });
    expect(res).not.toBeNull();
    expect(res!.line).not.toBeNull();
    // Value-identical to the anchor: producers that pass nothing are unmoved.
    expect(res!.line!.fromWorld).toEqual([ANCHOR[0], ANCHOR[1], ANCHOR[2]]);
  });

  it('omits the line (caption kept) when the raised bottom reaches the padded top', () => {
    // subjectSizePx 0 → lift floors at MIN_LABEL_CLEARANCE_PX (28), padded top
    // at 22 px. A 22 px bottom lift meets it — no room for a line to mean
    // anything — while the caption itself must still place.
    const res = liftedLabelPlacement({
      ...baseInput(),
      subjectSizePx: 0,
      lineBottomLiftPx: 22,
    });
    expect(res).not.toBeNull();
    expect(res!.line).toBeNull();
    expect(res!.labelWorldPos).toBeDefined();
  });

  it('keeps deep-zoom placement pixel-exact through an ill-conditioned NEAR0 frustum', () => {
    // The deep solar-system descent regime: near ~1e-16 Mpc with the far
    // plane on its FAR_MIN_MPC floor (3e-11), and a star-caption anchor at
    // parsec scale (~1.3e-6 Mpc) — nearly five orders BEYOND the far plane.
    // Inverting this matrix at f32 precision collapses its depth rows (the
    // two huge w-row coefficients round to the SAME f32 value), so the
    // un-projected line geometry lands at a garbage depth: measured ~14 px
    // of error on the re-projected line bottom — the wild leader-line
    // distortion and flicker seen live. The f64 chain holds every
    // re-projected point within ~1e-4 px, so the 0.05 px tolerance cleanly
    // separates the two paths.
    const proj = mat4d.perspective(1.0, 16 / 9, 1e-16, 3e-11);
    const view = mat4d.lookAt([0, 0, 0], [0.3, -0.2, -1], [0.1, 1, 0]);
    const vp = mat4d.multiply(proj, view) as Float64Array;
    const viewportPx: Vec2 = [1280, 720];
    // Off-axis anchor so every matrix row participates in the round trip.
    const len = Math.hypot(0.4, 0.3, 1);
    const anchor: Vec3 = [(0.4 / len) * 1.3e-6, (0.3 / len) * 1.3e-6, (-1 / len) * 1.3e-6];

    const res = liftedLabelPlacement({
      anchorWorldPos: anchor,
      vp,
      viewportPx,
      subjectSizePx: 20, // lift = max(28, 1.5·20) = 30 px; padded top = 24 px
      textBbox: null,
      worldEmMpc: 2.25e-14, // a solar radius — clamps to minPixelSize anyway
      minPixelSize: 13,
      maxPixelSize: 44,
      lineBottomLiftPx: 14,
    });
    expect(res).not.toBeNull();
    expect(res!.line).not.toBeNull();

    const dot = projectToScreen(vp, anchor, viewportPx);
    const label = projectToScreen(vp, res!.labelWorldPos, viewportPx);
    const bottom = projectToScreen(vp, res!.line!.fromWorld, viewportPx);
    const top = projectToScreen(vp, res!.line!.toWorld, viewportPx);

    // Every derived point re-projects vertically above the dot at its exact
    // pixel height: the caption at the 30 px lift, the line top at 24 px
    // (lift − padding, no ink), the line bottom at the requested 14 px.
    for (const [point, expectedLiftPx] of [
      [label, 30],
      [top, 24],
      [bottom, 14],
    ] as const) {
      expect(Math.abs(point[0] - dot[0])).toBeLessThan(0.05);
      expect(Math.abs(dot[1] - point[1] - expectedLiftPx)).toBeLessThan(0.05);
    }
  });
});
