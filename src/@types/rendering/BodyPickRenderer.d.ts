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
 *   - `drawPoints` rasterises the sub-pixel scene-star POINT partition as one
 *     instanced draw of ≤25 pick billboards, each floored to a ~3 px clickable
 *     footprint so a sub-pixel star stays clickable at its true screen position.
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
};

/** The instanced scene-star point-pick batch for one frame. */
export type BodyPointPickArgs = {
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  /** The point-partition scene stars to draw (≤25). One packed id per instance. */
  readonly points: readonly BodyPointPick[];
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
   * Record the scene-star POINT partition as one instanced pick-billboard draw.
   * MUST be called at most once per pick pass — it rebuilds its single instance
   * buffer with one `writeBuffer`, so a second same-pass call would race that
   * write against submit. No-op on an empty batch.
   */
  drawPoints(pass: GPURenderPassEncoder, args: BodyPointPickArgs): void;
};
