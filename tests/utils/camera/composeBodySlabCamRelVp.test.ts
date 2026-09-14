/**
 * composeBodySlabCamRelVp — the eye-relative twin of `composeBodySlabMvp`.
 *
 * Two things can break and nothing else catches them: the two matrices must
 * agree on where a surface point lands (or the analytic sphere's depth would no
 * longer match the proxy's vertex stage), and the eye-relative route must
 * survive the f32 narrow at contact range — which is the bug that put a rover's
 * wheels under the ground. Both expectations are computed independently of the
 * util under test.
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4 } from 'wgpu-matrix';

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { composeBodySlabCamRelVp } from '../../../src/utils/camera/composeBodySlabCamRelVp';
import { composeBodySlabMvp } from '../../../src/utils/camera/composeBodySlabMvp';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';

const MARS_RADIUS_M = 3_389_500;

/** A real perspective·lookAt, so a transposed embed or swapped multiply shows. */
function slabVp(): Float64Array {
  return mat4d.multiply(
    mat4d.perspective(Math.PI / 4, 1.6, 1, 1e9),
    mat4d.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]),
  ) as Float64Array;
}

/** clip.z / clip.w — exactly what the fragment writes to `frag_depth`. */
function depth(m: Float32Array | Float64Array, p: Readonly<Vec3>): number {
  const clip = vec4.transformMat4([p[0], p[1], p[2], 1], m);
  return (clip[2] as number) / (clip[3] as number);
}

describe('composeBodySlabCamRelVp', () => {
  it('agrees with composeBodySlabMvp once the eye offset is subtracted', () => {
    const vp = slabVp();
    const eyeRelBodyM: Vec3 = [3, -2, 5];
    const radiusM = 50;
    const pLocal: Vec3 = [0.3, -0.5, 0.8];

    const viaMvp = vec4.transformMat4(
      [pLocal[0], pLocal[1], pLocal[2], 1],
      composeBodySlabMvp(vp, eyeRelBodyM, radiusM),
    );
    // The camera-relative point in LOCAL units: the same surface point, minus
    // the eye expressed in body radii (what `bodySlabCamLocal` hands the shader).
    const camRel: Vec3 = [
      pLocal[0] - eyeRelBodyM[0] / radiusM,
      pLocal[1] - eyeRelBodyM[1] / radiusM,
      pLocal[2] - eyeRelBodyM[2] / radiusM,
    ];
    const viaCamRel = vec4.transformMat4(
      [camRel[0], camRel[1], camRel[2], 1],
      composeBodySlabCamRelVp(vp, radiusM),
    );

    for (let i = 0; i < 4; i++) {
      expect(viaCamRel[i]).toBeCloseTo(viaMvp[i] as number, 9);
    }
  });

  it('holds the written depth 10 m above Mars, where the mvp route loses a tenth of a metre', () => {
    // An oblique eye 10 m up, looking at the body centre: the rover case. The
    // direction is deliberately not axis-aligned — on an axis the f32 mvp's
    // columns land on exact integers and the cancellation is accidentally
    // lossless, which is not the arithmetic the renderer actually does.
    const up: Vec3 = ((): Vec3 => {
      const n = Math.hypot(0.31, -0.62, 0.72);
      return [0.31 / n, -0.62 / n, 0.72 / n];
    })();
    const eyeRelBodyM: Vec3 = [
      up[0] * (MARS_RADIUS_M + 10),
      up[1] * (MARS_RADIUS_M + 10),
      up[2] * (MARS_RADIUS_M + 10),
    ];
    const vp = mat4d.multiply(
      mat4d.perspective(Math.PI / 4, 1.6, 1, 1e9),
      mat4d.lookAt([0, 0, 0], [-up[0], -up[1], -up[2]], [0, 0, 1]),
    ) as Float64Array;

    const mvp64 = composeBodySlabMvp(vp, eyeRelBodyM, MARS_RADIUS_M);
    // The sub-eye point on the sphere, and the same point relative to the eye.
    const hitLocal: Vec3 = up;
    const camRelLocal: Vec3 = [
      up[0] - eyeRelBodyM[0] / MARS_RADIUS_M,
      up[1] - eyeRelBodyM[1] / MARS_RADIUS_M,
      up[2] - eyeRelBodyM[2] / MARS_RADIUS_M,
    ];

    const truth = depth(mvp64, hitLocal);
    // Depth is not linear in range, so calibrate the local slope in f64 and
    // report every error in metres: one metre deeper is one body radius' worth
    // of local radius below the hit.
    const deeper = 1 - 1 / MARS_RADIUS_M;
    const perMetre = depth(mvp64, [up[0] * deeper, up[1] * deeper, up[2] * deeper]) - truth;
    const metres = (d: number): number => (d - truth) / perMetre;

    const viaCamRel = depth(narrowMat4(composeBodySlabCamRelVp(vp, MARS_RADIUS_M)), camRelLocal);
    const viaMvp = depth(narrowMat4(mvp64), hitLocal);

    expect(Math.abs(metres(viaCamRel))).toBeLessThan(1e-3);
    // The regression this util exists for: the f32 mvp's ~10^6 m columns cancel
    // down to a 10 m offset and take the ground with them (~0.1 m here, and it
    // swings with the view direction — which is what the user sees as the
    // rover's wheels sinking and rising as the camera orbits).
    expect(Math.abs(metres(viaMvp))).toBeGreaterThan(0.01);
  });
});
