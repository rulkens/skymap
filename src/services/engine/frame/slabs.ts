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
import { computeViewProj } from '../../../utils/camera/computeViewProj';

/** Near-field slab: origin-relative bodies (Sun, Earth). Layerless until PR #386. */
export const NEAR0 = 0;
/** Cosmological slab: galaxies, Milky Way, filaments — everything at Mpc scale. */
export const COSMO = 1;

// The near-field slab's near/far track the camera's orbit distance instead of
// a fixed range: whatever the camera is currently orbiting (a planet vs. a
// galaxy cluster) sits comfortably inside [distance·1e-4, distance·100],
// which is the ~1e6 near/far ratio a depth buffer can resolve without
// z-fighting. A fixed near/far would either clip nearby geometry (too far)
// or waste precision on empty space (too near) depending on current scale.
const NEAR0_NEAR_RATIO = 1e-4;
const NEAR0_FAR_RATIO = 100;

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
 * The near-field row's vp reuses `computeViewProj`'s lookAt/perspective
 * shape by calling it on a camera clone whose `near`/`far` are overridden to
 * the slab's own adaptive range — this keeps the roll/lookAt math in the one
 * place that owns it (`computeViewProj`) instead of duplicating it here.
 * `computeViewProj` returns a `Float32Array`; widening it to `Float64Array`
 * is exact (every f32 value is representable in f64), so no precision is
 * lost by storing it in the `Slab.vp: Float64Array` slot.
 *
 * The cosmological row's vp is the caller's already-computed `cosmoVp`,
 * widened the same way. Because f32→f64 widening is exact, narrowing back
 * (`Float32Array.from(slab.vp)`) round-trips byte-equal to the original f32
 * matrix — which is why `slabViewOf` needs no COSMO special case below.
 */
export function deriveSlabs(cam: OrbitCamera, cosmoVp: Mat4): readonly Slab[] {
  const nearMpc = cam.distance * NEAR0_NEAR_RATIO;
  const farMpc = cam.distance * NEAR0_FAR_RATIO;
  const nearFieldVp = computeViewProj({ ...cam, near: nearMpc, far: farMpc });

  const near0: Slab = {
    index: NEAR0,
    nearMpc,
    farMpc,
    vp: Float64Array.from(nearFieldVp),
    // `originRelative: true` and the near-field camPos semantics are provisional:
    // they take effect only once the zoom-to-earth fold defines a `renderOrigin`
    // for this slab to be relative to. Until then this row hosts no layers and
    // appears in no frame step, so the flag has no observable effect yet.
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
