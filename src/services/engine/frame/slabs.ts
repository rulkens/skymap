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
import { foregroundFrustum } from '../../../utils/camera/foregroundFrustum';

/** Near-field slab: origin-relative near-Earth bodies (Sun, Earth), drawn in f64. */
export const NEAR0 = 0;
/** Cosmological slab: galaxies, Milky Way, filaments — everything at Mpc scale. */
export const COSMO = 1;

/**
 * Human-readable slab names, keyed by slab index, for debug surfaces. Kept
 * beside the NEAR0/COSMO index constants so a new slab row names itself here in
 * the same edit that assigns its index. `timedSlotRowsOf` (frameProgram.ts)
 * reads this to build each render slot's `groupKey` — `'<target>·<SLAB_NAME>'`,
 * e.g. `'hdr·COSMO'` — which the DebugPanel then buckets into a titled group.
 * A slab index missing here degrades gracefully: `SLAB_NAME[slab] ?? String(slab)`
 * yields a numeric key (e.g. `'hdr·5'`) whose unmapped title falls back to the
 * raw key rather than dropping the slot — so an unnamed slab reads as a
 * numerically-keyed group, never a lost one.
 */
export const SLAB_NAME: Readonly<Record<number, string>> = {
  [NEAR0]: 'NEAR0',
  [COSMO]: 'COSMO',
};

/**
 * The single source of each slab's depth convention: `false` ⇒ the classic
 * smaller-z-wins / clear-`1.0` / `mat4d.perspective` set; `true` ⇒ reversed-Z
 * (greater-wins / clear-`0` / `mat4d.perspectiveReverseZ`). Both are `false`
 * today, which makes every GPU pipeline descriptor, depth clear, and
 * foreground projection byte-identical to the previous implicit global.
 *
 * Flipping `[NEAR0]` to `true` is the reversed-Z feature switch: that one edit
 * propagates to every pipeline `depthCompare`, both depth clears, and the
 * foreground projection builder, because all of those read this constant —
 * either directly at renderer construction, or via the `reversedZ` flag echoed
 * onto the runtime `Slab` by `deriveSlabs`. Single-sourcing the convention here
 * is what makes the flip one constant instead of ~14 scattered sites, and makes
 * a partial (half-reversed) flip impossible.
 */
export const SLAB_REVERSED_Z: Readonly<Record<number, boolean>> = {
  [NEAR0]: false,
  [COSMO]: false,
};

// The near-field lookAt uses world +Y as the image-plane up. Roll parity with
// the cosmological slab's `computeViewProj` is deferred alongside the
// zoom-to-earth series.
const WORLD_UP: Vec3 = [0, 1, 0];

// The cosmological slab's near/far are fixed: 10 kpc sits safely below the
// nearest cosmological content (the closest satellite galaxies at tens of
// kpc), 50 Gpc comfortably contains every catalogued galaxy. Anything that
// draws INSIDE 10 kpc cannot live on this slab — the Milky Way impostor
// learned that the hard way (the fixed plane clipped its disc mid-descent)
// and moved to NEAR0, joining the star/orbit/caption rows there. Unlike the
// near-field slab, "how far back does the cosmological scene go" doesn't
// change as the user zooms — only the near-field slab's range is
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
  // The near-field slab's near/far are adaptive, sized from the camera's orbit
  // distance by `foregroundFrustum` so depth precision holds from galaxy scale
  // down to Earth's surface (and its far floor keeps the seeded orbit rings
  // inside the frustum). This is unlike the COSMO row's fixed
  // `COSMO_NEAR_MPC`/`COSMO_FAR_MPC`: the cosmological scene's depth doesn't
  // change as the user zooms, only the near-field's does.
  const { near: nearMpc, far: farMpc } = foregroundFrustum(cam.distance);
  const nearFieldVp = computeForegroundViewProj({
    eyeMpc: cam.position,
    targetMpc: cam.target,
    up: WORLD_UP,
    renderOrigin: RENDER_ORIGIN_MPC,
    fovYRad: cam.fovYRad,
    aspect: cam.aspect,
    near: nearMpc,
    far: farMpc,
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
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
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  };
  const cosmo: Slab = {
    index: COSMO,
    nearMpc: COSMO_NEAR_MPC,
    farMpc: COSMO_FAR_MPC,
    vp: Float64Array.from(cosmoVp),
    originRelative: false,
    precision: 'f32',
    reversedZ: SLAB_REVERSED_Z[COSMO]!,
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
