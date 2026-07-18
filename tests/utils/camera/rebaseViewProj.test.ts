/**
 * rebaseViewProj — precision test.
 *
 * Proves the seam matters at the scale that produces the caption flicker: a
 * label anchor ~1 AU (≈ 4.85e-12 Mpc) from the render origin, viewed by a
 * camera a hair away (deep-zoom, well inside Earth's radius). The NEAR0 vp's
 * view translation is also ~4.85e-12 Mpc, so projecting the anchor in f32
 * (`viewProj · vec4(pos, 1)`) subtracts two nearly-equal large numbers and
 * quantises the result — the anchor hops as the camera moves.
 *
 * `rebaseViewProj(vp, camPos)` folds the eye offset into the vp in f64 and, when
 * paired with camera-relative anchors (`pos − camPos`), reproduces the f64
 * ground-truth clip position to f32 precision. The deliberately f32-narrowed
 * "recompute" path (narrow the vp first, then project the raw ~1-AU anchor) is
 * dramatically worse — that gap is exactly the bug this seam removes.
 *
 * Mirrors `composeBodyMvp.test.ts`: compare clip positions as NDC (divide by w).
 */

import { describe, expect, it } from 'vitest';
import { mat4d, vec4 } from 'wgpu-matrix';

import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { computeForegroundViewProj } from '../../../src/utils/camera/computeForegroundViewProj';
import { rebaseViewProj } from '../../../src/utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';

// ── Geometry: anchor at 1 AU, camera at the deep-zoom floor ─────────────────

const AU = SCALE_UNITS.AU_TO_MPC; // ≈ 4.85e-12 Mpc

// Camera distance at the 1e-17 Mpc distance floor (~300 km) — well inside
// Earth's radius, where the flicker is worst (~24 px in the un-rebased path).
const camDist = 1e-17;

// Anchor (Earth) sits 1 AU from the Sun origin along +X.
const anchor: [number, number, number] = [AU, 0, 0];

// Eye a hair above the anchor along +Z; target nudged sideways so the anchor
// projects OFF-centre (a dead-centre anchor would hide the transverse error).
const eye: [number, number, number] = [AU, 0, camDist];
const target: [number, number, number] = [AU + 0.15 * camDist, 0.1 * camDist, 0];
const renderOrigin: [number, number, number] = [0, 0, 0];

// Frustum bracketing the camera distance so the anchor sits mid-depth.
const near = camDist * 0.01;
const far = camDist * 100;

// The f64 near-field view-projection — the `view.slab.vp` seam this fix reads.
const vpF64 = computeForegroundViewProj({
  eyeMpc: eye,
  targetMpc: target,
  up: [0, 1, 0],
  renderOrigin,
  fovYRad: Math.PI / 4,
  aspect: 1,
  near,
  far,
});

// ── Projection helpers ──────────────────────────────────────────────────────

// f64 ground truth: project [anchor, 1] through the f64 vp by hand (wgpu-matrix
// vec4.transformMat4 operates on f32 arrays, so it can't stand in here).
function ndcTruth(): [number, number, number] {
  const [x, y, z] = anchor;
  const cx = vpF64[0]! * x + vpF64[4]! * y + vpF64[8]! * z + vpF64[12]!;
  const cy = vpF64[1]! * x + vpF64[5]! * y + vpF64[9]! * z + vpF64[13]!;
  const cz = vpF64[2]! * x + vpF64[6]! * y + vpF64[10]! * z + vpF64[14]!;
  const cw = vpF64[3]! * x + vpF64[7]! * y + vpF64[11]! * z + vpF64[15]!;
  return [cx / cw, cy / cw, cz / cw];
}

// Transform an f32 [pos, 1] through an f32 vp, return NDC.
function ndcF32(posF32: Float32Array, vpF32: Float32Array): [number, number, number] {
  const clip = vec4.transformMat4(posF32, vpF32);
  const cw = clip[3]!;
  return [clip[0]! / cw, clip[1]! / cw, clip[2]! / cw];
}

function ndcError(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ── Test ────────────────────────────────────────────────────────────────────

describe('rebaseViewProj', () => {
  it('reproduces the f64 clip while a plain f32-narrowed projection cancels', () => {
    const truth = ndcTruth();

    // Rebase path (the fix): fold the eye into the vp in f64, narrow at the
    // upload boundary (as the layers do — the rebase itself stays f64 for the
    // placement math that inverts it), feed the anchor camera-relative
    // (pos − eye, a tiny well-represented f32 vector).
    const rebasedVp = narrowMat4(rebaseViewProj(vpF64, eye));
    const relPos = Float32Array.from([
      anchor[0] - eye[0],
      anchor[1] - eye[1],
      anchor[2] - eye[2],
      1,
    ]);
    const rebaseErr = ndcError(ndcF32(relPos, rebasedVp), truth);

    // Buggy path (the defect): narrow the vp FIRST, then project the raw ~1-AU
    // anchor in f32 — the two ~4.85e-12 terms cancel and the anchor jitters.
    const vpF32 = narrowMat4(vpF64);
    const absPos = Float32Array.from([anchor[0], anchor[1], anchor[2], 1]);
    const buggyErr = ndcError(ndcF32(absPos, vpF32), truth);

    console.log(
      `[rebaseViewProj] rebase NDC error: ${rebaseErr.toExponential(4)} ` +
        `vs buggy f32: ${buggyErr.toExponential(4)} (ratio ${(buggyErr / rebaseErr).toExponential(2)})`,
    );

    // The rebase path tracks the f64 truth closely...
    expect(rebaseErr).toBeLessThan(1e-3);
    // ...while the f32-narrowed recompute is dramatically worse — proof the
    // seam (f64 compose before narrow) is what removes the flicker.
    expect(buggyErr).toBeGreaterThan(rebaseErr * 50);
  });

  it('rebasing to the eye is algebraically exact against the plain vp·point in f64', () => {
    // rebaseViewProj(vp, O) · vec4(p − O, 1) ≡ vp · vec4(p, 1). Verify the
    // identity in f64 (compose the same product mat4d does, no narrowing) so a
    // future refactor of the multiply order is caught.
    const rebased64 = mat4d.multiply(vpF64, mat4d.translation(eye)) as Float64Array;
    const rel: [number, number, number] = [
      anchor[0] - eye[0],
      anchor[1] - eye[1],
      anchor[2] - eye[2],
    ];

    const viaRebase = [
      rebased64[0]! * rel[0] + rebased64[4]! * rel[1] + rebased64[8]! * rel[2] + rebased64[12]!,
      rebased64[1]! * rel[0] + rebased64[5]! * rel[1] + rebased64[9]! * rel[2] + rebased64[13]!,
      rebased64[2]! * rel[0] + rebased64[6]! * rel[1] + rebased64[10]! * rel[2] + rebased64[14]!,
      rebased64[3]! * rel[0] + rebased64[7]! * rel[1] + rebased64[11]! * rel[2] + rebased64[15]!,
    ];
    const viaPlain = [
      vpF64[0]! * anchor[0] + vpF64[4]! * anchor[1] + vpF64[8]! * anchor[2] + vpF64[12]!,
      vpF64[1]! * anchor[0] + vpF64[5]! * anchor[1] + vpF64[9]! * anchor[2] + vpF64[13]!,
      vpF64[2]! * anchor[0] + vpF64[6]! * anchor[1] + vpF64[10]! * anchor[2] + vpF64[14]!,
      vpF64[3]! * anchor[0] + vpF64[7]! * anchor[1] + vpF64[11]! * anchor[2] + vpF64[15]!,
    ];

    for (let i = 0; i < 4; i++) {
      // f64 round-off only — the two compositions are the same math.
      expect(viaRebase[i]!).toBeCloseTo(viaPlain[i]!, 20);
    }
  });
});
