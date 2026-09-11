import { describe, it, expect } from 'vitest';
import { near0LabelProjection } from '../../../../src/services/engine/frame/near0LabelProjection';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum } from '../../../../src/utils/camera/foregroundFrustum';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { NEAR0, SLAB_REVERSED_Z } from '../../../../src/services/engine/frame/slabs';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

const M = SCALE_UNITS.M_TO_MPC;

/** Clip-space image of an eye-relative point under a column-major 4×4. */
function project(m: Float32Array | Float64Array, p: readonly [number, number, number]) {
  const at = (r: number) => m[r]! * p[0] + m[r + 4]! * p[1] + m[r + 8]! * p[2] + m[r + 12]!;
  return { x: at(0), y: at(1), w: at(3) };
}

/**
 * The pose the shrink was measured at: camera a solar-system distance from the
 * render origin (which is what forces the f64 rebase) and 31 m off a body.
 */
function near0Ctx(): ReadyFrameContext {
  const camDistance = 31 * M;
  const eye: [number, number, number] = [SCALE_UNITS.AU_TO_MPC, 0, 0];
  const { near, far } = foregroundFrustum(camDistance);
  const vp = computeForegroundViewProj({
    eyeMpc: eye,
    targetMpc: [eye[0] + camDistance, 0, 0],
    up: [0, 1, 0],
    renderOrigin: [0, 0, 0],
    fovYRad: Math.PI / 4,
    aspect: 16 / 9,
    near,
    far,
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  });
  return {
    slabs: [{ near, far, vp }],
    drawCamPos: eye,
    canvasSize: { width: 1600, height: 900 },
  } as unknown as ReadyFrameContext;
}

// ~10 m ahead of the eye, a little off-axis so the NDC comparison has signal.
const ANCHOR: [number, number, number] = [10 * M, 1 * M, 2 * M];

describe('near0LabelProjection', () => {
  it('uploads a matrix whose clip w stays far above the rasterizer floor', () => {
    const { vpF32 } = near0LabelProjection(near0Ctx());
    // The floor is ~1e-20; unscaled Mpc anchors land at ~3e-22 here.
    expect(Math.abs(project(vpF32, ANCHOR).w)).toBeGreaterThanOrEqual(1);
  });

  it('puts the anchor on the same pixel as the f64 placement matrix', () => {
    const { vp, vpF32 } = near0LabelProjection(near0Ctx());
    const placed = project(vp, ANCHOR);
    const uploaded = project(vpF32, ANCHOR);
    expect(uploaded.x / uploaded.w).toBeCloseTo(placed.x / placed.w, 5);
    expect(uploaded.y / uploaded.w).toBeCloseTo(placed.y / placed.w, 5);
  });
});
