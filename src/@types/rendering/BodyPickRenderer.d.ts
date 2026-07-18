/**
 * BodyPickRenderer — the r32uint pick provider for the NEAR0 foreground bodies
 * (Earth, the planets, and the ~25 seeded scene stars incl. the Sun).
 *
 * It is the body-family analogue of `StarCatalogPickRenderer`: it records
 * pickable geometry into an ALREADY-BEGUN r32uint pick pass (owned by the pick
 * program), stamping each body's caller-packed identity into the texel it
 * covers. It owns no pass, no texture and no readback.
 *
 * ### Two geometries, one renderer
 *
 * Foreground bodies split into two pick shapes, mirroring how their visual
 * siblings split (`starRenderer`/`planetRenderer`/`earthRenderer` draw spheres,
 * `starPointRenderer` draws billboards):
 *
 *   - `drawSphere` rasterises ONE body sphere per call (Earth, a planet, or a
 *     resolved scene-star sphere). Each call carries its OWN CPU-baked MVP + a
 *     fully-packed pick id, so the ≤10 sphere draws recorded into one pass each
 *     resolve to their OWN body.
 *   - `drawPoints` rasterises a sub-pixel body POINT partition as one instanced
 *     draw of ≤25 pick billboards, each expanded to a generous 18 px clickable
 *     footprint (labelled scene stars and sub-pixel solar-system body glints —
 *     click-invited targets) so a sub-pixel body stays easily clickable at its
 *     true screen position. Called once per caller per pass, each caller claiming
 *     its own per-pass slot of buffers.
 *
 * ### Why own-uniform, not the COSMO shared pick camera
 *
 * The COSMO point-pick camera is a shared `@group(0)` BGL contract; the bodies
 * do not use it. Body renderers bake their MVP CPU-side (f64 `composeBodyMvp` →
 * `narrowMat4`), so the pick pipelines follow that same OWN-uniform pattern —
 * the sphere path binds a per-draw uniform block; the points path binds a
 * per-frame camera uniform + a per-frame instance buffer.
 *
 * ### Why the caller passes fully-packed ids
 *
 * `packedId` is already `packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)`
 * — composed CPU-side by the body layers (Task 11) from each body's stable seed
 * index, NOT from `@builtin(instance_index)` (which shifts as bodies enter and
 * leave the resolved/point partitions). The shaders write `packedId` RAW into
 * the r32uint target; no packing math lives on the GPU.
 *
 * ### Depth-tested (the visual sibling passes vary)
 *
 * Every body pick pipeline declares the NEAR0 `depth32float` depth profile
 * (`depthCompare: 'less'`, `depthWriteEnabled: true`) so overlapping bodies —
 * a Moon in front of Earth — resolve nearest-wins, matching visual occlusion.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

/**
 * One sphere body's pick draw: its CPU-baked model-view-projection (16 f32,
 * column-major — the exact matrix `composeBodyMvp` narrows for the visual
 * sibling, so the pick sphere is silhouette-identical to the visual one) plus
 * the fully-packed identity the fragment stamps.
 */
export type BodySpherePickArgs = {
  /** Column-major MVP (16 f32), camera-relative, narrowed from f64. */
  readonly mvp: Float32Array;
  /** Fully-packed pick id (`packSelection(code, seedIndex + offset)`). */
  readonly packedId: number;
};

/** One scene-star POINT-partition body: its camera-relative anchor + packed id. */
export type BodyPointPick = {
  /** Star position rebased into the camera-relative frame (Mpc, f64→f32-safe). */
  readonly posRelCamMpc: Vec3;
  /** Fully-packed pick id (`packSelection(code, seedIndex + offset)`). */
  readonly packedId: number;
  /**
   * Glint priority CLASS — `0` earth, `1` planet, `2` moon. Read ONLY by the
   * `'glint'` variant (the 20-byte instance stride), where `vsGlint` maps it to
   * its own pick-depth band so importance, not nearness, orders overlapping
   * glints. The `'sceneStar'` variant (16-byte stride) ignores it; omit it there.
   */
  readonly bandClass?: number;
};

/**
 * Which pick-depth semantics the point batch draws with — the two share one
 * explicit pipeline layout, differing in the vertex entry AND its instance
 * stride:
 *
 *   - `'sceneStar'` (default) — the famous / scene stars: `vs` MIN-CLAMPS true
 *     depth onto the scene-star band, so within-far stars sort physically.
 *     16-byte instance stride (posRelCamMpc + packedId).
 *   - `'glint'` — the sub-pixel solar-system body glints (+ the Earth stamp):
 *     `vsGlint` FORCES a per-instance CLASS band (`bandClass`) so importance, not
 *     nearness, orders them — earth-over-planet-over-moon is an unconditional
 *     depth win, no draw-order tie-break. 20-byte instance stride (posRelCamMpc +
 *     packedId + bandClass). See `starPointPick.wesl` / `lib/pickDepthBands.wesl`.
 */
export type BodyPointPickVariant = 'sceneStar' | 'glint';

/** The instanced scene-star / body-glint point-pick batch for one frame. */
export type BodyPointPickArgs = {
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  /** The point-partition bodies to draw (≤25). One packed id per instance. */
  readonly points: readonly BodyPointPick[];
  /** Pick-depth variant; defaults to `'sceneStar'` so existing callers are unchanged. */
  readonly variant?: BodyPointPickVariant;
};

export type BodyPickRenderer = Renderer & {
  /**
   * Record ONE body sphere into an already-begun r32uint pick pass. Each call
   * writes its own dynamic-offset uniform slot (mvp + packedId), so the ≤10
   * sphere draws in one pass never collapse onto the last body's id (the
   * writeBuffer-vs-submit race). Advancing cursor resets per pass.
   */
  drawSphere(pass: GPURenderPassEncoder, args: BodySpherePickArgs): void;
  /**
   * Record a sub-pixel body POINT partition as one instanced pick-billboard draw.
   * Safe to call MULTIPLE times per pick pass (once per caller: the scene stars +
   * the body glints): each call claims its own per-pass slot of buffers, so no
   * caller's `writeBuffer` races another's against submit. No-op on an empty
   * batch (the cursor is not advanced, so the empty call costs no slot).
   */
  drawPoints(pass: GPURenderPassEncoder, args: BodyPointPickArgs): void;
};
