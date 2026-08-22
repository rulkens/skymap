/**
 * vrSpikeState — THROWAWAY (Quest 3 WebXR spike, 2026-08-22).
 *
 * Shared mutable override between the XR session loop (vrSpike.ts) and the
 * engine frame path. When `vrOverride.active`, runFrame skips the CSS-driven
 * canvas resize and renderFrame loops the frame program once per eye,
 * targeting the XR projection layer's textures with per-eye matrices built
 * here. Everything is spike-grade: casts over type surgery, module singleton
 * over plumbing. Delete with the spike.
 */

import { mat4, mat4d } from 'wgpu-matrix';
import type { Vec3 } from '../../@types/math/Vec3';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../@types/engine/frame/Slab';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';

/** Signed frustum half-tangents decomposed from an XRView.projectionMatrix. */
export type EyeTangents = { l: number; r: number; d: number; u: number };

/** World-space billboard axes for one eye, stamped onto `ReadyFrameContext`. */
export type VrBillboardBasis = { right: Vec3; up: Vec3 };

export type VrEye = {
  /** world→eye view matrix in Mpc, f32 col-major (COSMO slab). */
  viewCosmo: Float32Array;
  /** origin-relative world→eye view matrix, f64 col-major (NEAR0 slab). */
  viewNear0: Float64Array;
  tan: EyeTangents;
  /** eye position in world Mpc — becomes ctx.drawCamPos for this eye's pass. */
  camPos: Vec3;
  /** this eye's color target in the XR projection layer. */
  textureView: GPUTextureView;
};

export type VrOverride = {
  active: boolean;
  /** symmetric-equivalent vertical FOV for planners (pxPerRad etc.). */
  fovYRad: number;
  eyes: VrEye[];
  /**
   * World-space direction of the user's physical (XR-reference) vertical
   * this frame — the world direction that currently appears "up" to the
   * user regardless of any left-stick orbit — for label-orientation
   * consumers outside the render loop. `[0, 1, 0]` (inert placeholder) when
   * no XR session is active.
   */
  physicalUpWorld: Vec3;
};

export const vrOverride: VrOverride = {
  active: false,
  fovYRad: 1.0,
  eyes: [],
  physicalUpWorld: [0, 1, 0],
};

/** tanL/tanR/tanD/tanU from a GL-convention XRView.projectionMatrix. */
export function tangentsOf(p: Float32Array): EyeTangents {
  return {
    l: (p[8]! - 1) / p[0]!,
    r: (p[8]! + 1) / p[0]!,
    d: (p[9]! - 1) / p[5]!,
    u: (p[9]! + 1) / p[5]!,
  };
}

/** Asymmetric perspective, WebGPU [0,1] depth, finite far (COSMO convention). */
function perspectiveFromTangents32(t: EyeTangents, near: number, far: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 2 / (t.r - t.l);
  m[5] = 2 / (t.u - t.d);
  m[8] = (t.r + t.l) / (t.r - t.l);
  m[9] = (t.u + t.d) / (t.u - t.d);
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (near * far) / (near - far);
  return m;
}

/** Asymmetric infinite-far reversed-Z perspective, f64 (NEAR0 convention). */
function perspectiveReverseZFromTangents64(t: EyeTangents, near: number): Float64Array {
  const m = new Float64Array(16);
  m[0] = 2 / (t.r - t.l);
  m[5] = 2 / (t.u - t.d);
  m[8] = (t.r + t.l) / (t.r - t.l);
  m[9] = (t.u + t.d) / (t.u - t.d);
  m[10] = 0;
  m[11] = -1;
  m[14] = near;
  return m;
}

/**
 * Build a world→eye view matrix from the eye's world-space basis columns
 * (X=right, Y=up, Z=back) and position. Col-major; generic over f32/f64.
 */
export function viewFromBasis<T extends Float32Array | Float64Array>(
  out: T,
  X: Vec3,
  Y: Vec3,
  Z: Vec3,
  eye: Vec3,
): T {
  out[0] = X[0];
  out[1] = Y[0];
  out[2] = Z[0];
  out[3] = 0;
  out[4] = X[1];
  out[5] = Y[1];
  out[6] = Z[1];
  out[7] = 0;
  out[8] = X[2];
  out[9] = Y[2];
  out[10] = Z[2];
  out[11] = 0;
  out[12] = -(X[0] * eye[0] + X[1] * eye[1] + X[2] * eye[2]);
  out[13] = -(Y[0] * eye[0] + Y[1] * eye[1] + Y[2] * eye[2]);
  out[14] = -(Z[0] * eye[0] + Z[1] * eye[1] + Z[2] * eye[2]);
  out[15] = 1;
  return out;
}

/**
 * Recover the world-space right/up axes baked into a view matrix built by
 * `viewFromBasis` (X=right, Y=up, Z=back, col-major): the view matrix's
 * rotation rows are the world-space basis vectors it was built from, so row 0
 * is `right` and row 1 is `up` — no re-derivation from camera state needed.
 */
function billboardBasisFromView(view: Float32Array | Float64Array): VrBillboardBasis {
  return {
    right: [view[0]!, view[4]!, view[8]!],
    up: [view[1]!, view[5]!, view[9]!],
  };
}

/** Origin-relative variant of viewFromBasis for the NEAR0 slab (f64). */
export function viewFromBasisOriginRelative(X: Vec3, Y: Vec3, Z: Vec3, eyeMpc: Vec3): Float64Array {
  const rel: Vec3 = [
    eyeMpc[0] - RENDER_ORIGIN_MPC[0],
    eyeMpc[1] - RENDER_ORIGIN_MPC[1],
    eyeMpc[2] - RENDER_ORIGIN_MPC[2],
  ];
  return viewFromBasis(new Float64Array(16), X, Y, Z, rel);
}

/**
 * Mutate this frame's ctx for one eye: swap in the per-eye vp + slab table +
 * camera position, and reset the first-touch set so every render target
 * clears again for this eye's walk of the frame program.
 *
 * The near/far brackets are read off the slabs the normal orbit-camera path
 * already derived this frame, so the eye projections share the exact depth
 * conventions (COSMO finite [0,1], NEAR0 infinite reversed-Z) the pipelines
 * were built for.
 */
export function applyVrEyeToCtx(ctx: ReadyFrameContext, eye: VrEye): void {
  const near0 = ctx.slabs[0]!;
  const cosmo = ctx.slabs[1]!;

  const projC = perspectiveFromTangents32(eye.tan, cosmo.nearMpc, cosmo.farMpc);
  const vpC = mat4.multiply(projC, eye.viewCosmo) as Float32Array;

  const projN = perspectiveReverseZFromTangents64(eye.tan, near0.nearMpc);
  const vpN = mat4d.multiply(projN, eye.viewNear0) as Float64Array;

  const slabs: Slab[] = [
    { ...near0, vp: vpN },
    { ...cosmo, vp: Float64Array.from(vpC) },
  ];

  // Spike-grade: ReadyFrameContext's fields are readonly by design; this
  // module is the one sanctioned mutator while the spike lives.
  const w = ctx as unknown as {
    vp: Float32Array;
    slabs: readonly Slab[];
    drawCamPos: Readonly<Vec3>;
    vrBillboardBasis?: VrBillboardBasis;
  };
  w.vp = vpC;
  w.slabs = slabs;
  w.drawCamPos = [eye.camPos[0], eye.camPos[1], eye.camPos[2]];
  // Rotation is identical between the two eye view matrices (only the
  // translation differs), so either slab's view yields the same basis.
  w.vrBillboardBasis = billboardBasisFromView(eye.viewCosmo);

  (ctx.renderedTargets as Set<string>).clear();
}
