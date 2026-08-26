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
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import type { ImagePlaneBasis } from '../../../@types/camera/ImagePlaneBasis';

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
 * The ONE definition of a merged group-timing slot key — the string a render
 * step's whole layer group is billed against. `timedSlotRowsOf` (frameProgram)
 * allocates the slot under this key; `executeFrame`'s merged pass resolves it
 * via `descriptorFor(groupKey)`. The two sites must produce byte-identical
 * keys, so the format lives here rather than as twin inline templates that
 * could silently drift. The middle-dot separator (U+00B7) and the
 * `?? String(slab)` fallback (which keeps the key stable for a slab index
 * `SLAB_NAME` doesn't cover) are part of that wire format — do not vary them.
 */
export function groupKeyOf(target: string, slab: number): string {
  return `${target}·${SLAB_NAME[slab] ?? String(slab)}`;
}

/**
 * The single source of each slab's depth convention: `false` ⇒ the classic
 * smaller-z-wins / clear-`1.0` / `mat4d.perspective` set; `true` ⇒ reversed-Z
 * (greater-wins / clear-`0` / `mat4d.perspectiveReverseZ`).
 *
 * NEAR0 is `true`: its foreground bracket spans a ~1e8 near/far ratio (Earth's
 * surface out to Jupiter's orbit), and a finite non-reversed perspective
 * crowds nearly all its depth resolution against the near plane — so a body at
 * the far end (the Sun at 1 AU) quantizes onto the far plane and flickers.
 * Infinite-far reversed-Z spreads reciprocal-depth precision near-uniformly and
 * removes the far plane entirely, so the whole near-field scene resolves in one
 * `depth32float` buffer. COSMO stays `false`: its fixed 10 kpc → 50 Gpc bracket
 * is served fine by the classic convention, and its pick pipelines + clear must
 * stay smaller-z-wins.
 *
 * This one constant is the reversed-Z feature switch: `[NEAR0]` propagates to
 * every pipeline `depthCompare`, both depth clears, and the foreground
 * projection builder, because all of those read this constant — either directly
 * at renderer construction, or via the `reversedZ` flag echoed onto the runtime
 * `Slab` by `deriveSlabs`. Single-sourcing the convention here is what makes the
 * flip one constant instead of ~14 scattered sites, and makes a partial
 * (half-reversed) flip impossible.
 */
export const SLAB_REVERSED_Z: Readonly<Record<number, boolean>> = {
  [NEAR0]: true,
  [COSMO]: false,
};

// The near-field lookAt derives its image-plane up through the shared
// `imagePlaneBasis` seam. The base up is the frame pole (`frameUp(cam.upBasis)`;
// world +Y absent a basis). Roll is 0 here — roll parity with the cosmological
// slab's `computeViewProj` is deferred alongside the zoom-to-earth series.

// Module-scope scratch reused each frame: the forward view direction, the
// frame-pole reference up, and the roll-adjusted basis. `deriveSlabs` runs once
// per frame, so all three are hoisted out to avoid per-call allocation.
const forwardScratch: Vec3 = [0, 0, 0];
const upRefScratch: Vec3 = [0, 0, 0];
const basisScratch: ImagePlaneBasis = { rolledUp: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };

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
 *
 * `pivotRadiusMpc` (default `null`) is the orbit pivot's physical radius when
 * one is focused — see `foregroundFrustum`'s near-plane bracket for why the
 * near-field row keys off ALTITUDE above the pivot, not raw `cam.distance`,
 * once a pivot is known.
 */
export function deriveSlabs(
  cam: OrbitCamera,
  cosmoVp: Mat4,
  pivotRadiusMpc: number | null = null,
): readonly Slab[] {
  // The near-field slab's near/far are adaptive, sized from the camera's
  // ALTITUDE above a known pivot (else raw orbit distance) by
  // `foregroundFrustum`, so depth precision holds from galaxy scale down to
  // standing on a body's surface — a large body's radius no longer dominates
  // the bracket the way raw distance did. This is unlike the COSMO row's fixed
  // `COSMO_NEAR_MPC`/`COSMO_FAR_MPC`: the cosmological scene's depth doesn't
  // change as the user zooms, only the near-field's does.
  const altitudeMpc = pivotRadiusMpc !== null ? cam.distance - pivotRadiusMpc : cam.distance;
  const { near: nearMpc, far: farMpc } = foregroundFrustum(altitudeMpc);
  // The image-plane up comes from the shared basis seam. At roll 0 `rolledUp`
  // is exactly the frame pole (`frameUp(cam.upBasis)`; world +Y absent a
  // basis), so this tracks the cosmological slab's up through the one seam.
  const fx = cam.target[0] - cam.position[0];
  const fy = cam.target[1] - cam.position[1];
  const fz = cam.target[2] - cam.position[2];
  const flen = Math.hypot(fx, fy, fz) || 1;
  forwardScratch[0] = fx / flen;
  forwardScratch[1] = fy / flen;
  forwardScratch[2] = fz / flen;
  const { rolledUp } = imagePlaneBasis(
    forwardScratch,
    0,
    frameUp(cam.upBasis, upRefScratch),
    basisScratch,
  );
  const nearFieldVp = computeForegroundViewProj({
    eyeMpc: cam.position,
    targetMpc: cam.target,
    up: rolledUp,
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
    // The vp above is expressed relative to `RENDER_ORIGIN_MPC`, so any layer
    // bound to this slab must upload origin-relative model matrices.
    // `RENDER_ORIGIN_MPC` is the world origin today, which makes
    // `ctx.drawCamPos` (derived from `cam.position`) already origin-relative; a
    // future floating origin would re-derive a per-slab `camPos` in
    // `slabViewOf`.
    frame: { kind: 'world-mpc', originRelative: true },
    precision: 'f64',
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  };
  const cosmo: Slab = {
    index: COSMO,
    nearMpc: COSMO_NEAR_MPC,
    farMpc: COSMO_FAR_MPC,
    vp: Float64Array.from(cosmoVp),
    frame: { kind: 'world-mpc', originRelative: false },
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
