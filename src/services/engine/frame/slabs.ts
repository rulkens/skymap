/**
 * slabs — per-frame derivation of the `Slab` table, and the executor-side
 * lookup that resolves a `slab: number` index into a `SlabView`.
 *
 * Skymap's depth range (Earth at near-field scale out to distant galaxies)
 * spans a near/far ratio no single depth buffer can hold — see the `Slab`
 * type doc for the full precision argument. The fix already shipped as two
 * unlabelled ad-hoc concepts (a "foreground" near-field view-proj and the
 * main cosmological view-proj); this module names both as rows of one table
 * so a future third slab (e.g. an adaptive set during a zoom descent) is one
 * more row, not a new code path threaded through every call site.
 *
 * `deriveSlabs` is called once per frame, right where the cosmological `vp`
 * is already being computed (`frameContext.ts`) — see that module for why
 * there must be exactly one derivation site.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../@types/engine/frame/Slab';
import type { SlabView } from '../../../@types/engine/frame/SlabView';
import type { Vec3 } from '../../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { computeForegroundViewProj } from '../../../utils/camera/computeForegroundViewProj';

/** Near-field slab: origin-relative near-Earth bodies (Sun, Earth), drawn in f64. */
export const NEAR0 = 0;
/** Cosmological slab: galaxies, Milky Way, filaments — everything at Mpc scale. */
export const COSMO = 1;

// The near-field slab's near/far track the camera's orbit distance instead of
// a fixed range: whatever the camera is currently orbiting (a planet vs. a
// galaxy cluster) sits comfortably inside [distance·1e-4, distance·100],
// which is the ~1e6 near/far ratio a depth buffer can resolve without
// z-fighting. The bracket keeps a ~1-AU body framed through the full descent,
// and near > 0 always holds because `cam.distance > 0` by the orbit-controls
// clamp. A fixed near/far would either clip nearby geometry (too far) or waste
// precision on empty space (too near) depending on current scale.
//
// Forward reference: the zoom-to-earth series' Plan 03
// (docs/superpowers/plans/2026-06-29-zoom-to-earth-03-lod-and-polish.md)
// replaces both ratios with an adaptive `foregroundFrustum(cam.distance)`.
const NEAR0_NEAR_RATIO = 1e-4;
const NEAR0_FAR_RATIO = 100;

// The near-field lookAt uses world +Y as the image-plane up. Roll parity with
// the cosmological slab's `computeViewProj` is deferred alongside the
// zoom-to-earth series.
const WORLD_UP: Vec3 = [0, 1, 0];

// The cosmological slab's near/far are fixed: 10 kpc keeps the Milky Way's
// disk from clipping, 50 Gpc comfortably contains every catalogued galaxy.
// Unlike the near-field slab, "how far back does the cosmological scene go"
// doesn't change as the user zooms — only the near-field slab's range is
// camera-relative.
const COSMO_NEAR_MPC = 0.01;
const COSMO_FAR_MPC = 50000;

/**
 * Derive this frame's slab table from the live camera and the already-computed
 * cosmological view-proj.
 *
 * The near-field row's vp is an origin-relative f64 view-projection built by
 * `computeForegroundViewProj`: eye and target are subtracted from
 * `RENDER_ORIGIN_MPC` in f64 before `lookAt`, so the translation stays small
 * and sub-metre bodies (Sun, Earth) survive the eventual narrow to f32 at the
 * GPU-upload boundary. The result is a native `Float64Array`, stored directly
 * in the `Slab.vp: Float64Array` slot with no widening.
 *
 * The cosmological row's vp is the caller's already-computed `cosmoVp`,
 * widened the same way. Because f32→f64 widening is exact, narrowing back
 * (`Float32Array.from(slab.vp)`) round-trips byte-equal to the original f32
 * matrix — which is why `slabViewOf` needs no COSMO special case below.
 */
export function deriveSlabs(cam: OrbitCamera, cosmoVp: Mat4): readonly Slab[] {
  const nearMpc = cam.distance * NEAR0_NEAR_RATIO;
  const farMpc = cam.distance * NEAR0_FAR_RATIO;
  const nearFieldVp = computeForegroundViewProj({
    eyeMpc: cam.position,
    targetMpc: cam.target,
    up: WORLD_UP,
    renderOrigin: RENDER_ORIGIN_MPC,
    fovYRad: cam.fovYRad,
    aspect: cam.aspect,
    near: nearMpc,
    far: farMpc,
  });

  const near0: Slab = {
    index: NEAR0,
    nearMpc,
    farMpc,
    vp: nearFieldVp,
    // `originRelative: true` is now live: the vp above is expressed relative to
    // `RENDER_ORIGIN_MPC`, so any layer bound to this slab must upload
    // origin-relative model matrices. `RENDER_ORIGIN_MPC` is the world origin
    // today, which makes `ctx.drawCamPos` (derived from `cam.position`) already
    // origin-relative; a future floating origin would re-derive a per-slab
    // `camPos` in `slabViewOf`.
    originRelative: true,
    precision: 'f64',
  };
  const cosmo: Slab = {
    index: COSMO,
    nearMpc: COSMO_NEAR_MPC,
    farMpc: COSMO_FAR_MPC,
    vp: Float64Array.from(cosmoVp),
    originRelative: false,
    precision: 'f32',
  };
  return [near0, cosmo];
}

/**
 * Resolve a `slab: number` index (as named by a `FrameStep`) into the
 * `SlabView` a layer's `draw` call consumes.
 *
 * `ctx.slabs` is indexed by array position === `Slab.index` (deriveSlabs
 * builds it that way), so this is a direct array lookup rather than a
 * `.find()` scan.
 */
export function slabViewOf(ctx: ReadyFrameContext, slabIndex: number): SlabView {
  const slab = ctx.slabs[slabIndex];
  if (!slab) {
    throw new Error(`slabViewOf: no slab at index ${slabIndex}`);
  }
  return {
    slab,
    vp: Float32Array.from(slab.vp),
    // `ctx.drawCamPos` is `Readonly<Vec3>` (a readonly tuple); `SlabView.camPos`
    // is the plain mutable `Vec3` alias. Copying the three elements into a
    // fresh tuple satisfies that shape without widening the readonly-ness of
    // the source — same pattern `deriveFrameContext` uses to produce
    // `drawCamPos` from `cam.position` in the first place.
    camPos: [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
}
