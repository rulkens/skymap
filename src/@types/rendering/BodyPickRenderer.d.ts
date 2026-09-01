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
 *     fully-packed pick id, so the sphere draws recorded across one SUBMIT
 *     each resolve to their OWN body — see `beginSubmit` below.
 *   - `drawPoints` rasterises a sub-pixel body POINT partition as one instanced
 *     draw of ≤25 pick billboards, each expanded to a generous 18 px clickable
 *     footprint (labelled scene stars and sub-pixel solar-system body glints —
 *     click-invited targets) so a sub-pixel body stays easily clickable at its
 *     true screen position. Safe to call multiple times per submit — same
 *     `beginSubmit` contract.
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
 * (`depthCompare: 'greater'`, `depthWriteEnabled: true`) so overlapping bodies —
 * a Moon in front of Earth — resolve nearest-wins, matching visual occlusion.
 * Under the NEAR0 slab's reversed-Z convention (clear `0.0`, greater-z-wins) a
 * nearer body writes a LARGER stored depth, so `greater` is what makes it win.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';

/**
 * One sphere body's pick draw: its CPU-baked model-view-projection (16 f32,
 * column-major — the exact matrix `composeBodyMvp` narrows for the visual
 * sibling, so the pick sphere is silhouette-identical to the visual one), the
 * camera in that same body-local frame, and the fully-packed identity the
 * fragment stamps.
 *
 * `mvp` and `camPosLocal` are a PAIR and must be composed from the one radius:
 * the mvp's model scale defines the frame, and `camPosLocal` is a position
 * measured in it. `drawFlooredSpherePick` computes both from its single
 * `pickRadiusMpc` local, which is what keeps them from drifting.
 */
export type BodySpherePickArgs = {
  /** Column-major MVP (16 f32), camera-relative, narrowed from f64. */
  readonly mvp: Float32Array;
  /** Camera in the body's local frame, in FLOORED-pick-radius units — the ray origin. */
  readonly camPosLocal: Readonly<Vec3>;
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

/**
 * One GLINT point: a `BodyPointPick` plus the REQUIRED glint priority CLASS
 * (`0` earth, `1` planet, `2` moon — see `glintBandClass.ts`). Read by the
 * `'glint'` variant (the 20-byte instance stride), where `vsGlint` maps it to
 * its own pick-depth band so importance, not nearness, orders overlapping glints.
 *
 * `bandClass` is REQUIRED, not optional: the scene-star and glint point sets are
 * distinguished at the TYPE level by whether they carry it, so a glint caller
 * cannot silently omit it and fall to a runtime default band (class 0 is the
 * strongest — the Earth band — so a forgotten class would tie Earth at forced-
 * equal depth and reintroduce the ulp-jitter roulette the class bands exist to
 * eliminate). Making illegal states unrepresentable is why there is no `?? …`
 * default on the packing side.
 */
export type BodyGlintPick = BodyPointPick & {
  readonly bandClass: number;
};

/**
 * The instanced scene-star / body-glint point-pick batch for one frame — a
 * DISCRIMINATED UNION on `variant`, so each variant's `points` element type is
 * pinned. The two share one explicit pipeline layout, differing in the vertex
 * entry AND its instance stride:
 *
 *   - `'sceneStar'` (default) — the famous / scene stars: `vs` MIN-CLAMPS true
 *     depth onto the scene-star band, so within-far stars sort physically.
 *     `BodyPointPick[]`, 16-byte instance stride (posRelCamMpc + packedId).
 *   - `'glint'` — the sub-pixel solar-system body glints (+ the Earth stamp):
 *     `vsGlint` FORCES a per-instance CLASS band (`bandClass`) so importance, not
 *     nearness, orders them — earth-over-planet-over-moon is an unconditional
 *     depth win, no draw-order tie-break. `BodyGlintPick[]` (bandClass REQUIRED),
 *     20-byte stride. See `starPointPick.wesl` / `lib/pickDepthBands.wesl`.
 */
export type BodyPointPickArgs =
  | {
      /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
      readonly vp: Float32Array;
      /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
      readonly viewportPx: Vec2;
      /** The scene-star point-partition bodies to draw (≤25). One packed id per instance. */
      readonly points: readonly BodyPointPick[];
      /** Defaults to `'sceneStar'` so existing callers are unchanged. */
      readonly variant?: 'sceneStar';
    }
  | {
      readonly vp: Float32Array;
      readonly viewportPx: Vec2;
      /** The glint points to draw (≤25). Each carries its REQUIRED `bandClass`. */
      readonly points: readonly BodyGlintPick[];
      readonly variant: 'glint';
    };

export type BodyPickRenderer = Renderer & {
  /**
   * Reset the sphere + point slot cursors for a fresh submit. The submit owner
   * (`pickProgram.pick()` / `renderForDebug()`) calls this ONCE, before recording
   * any of that submit's passes — NOT once per pass, which is the bug this
   * contract replaced (see `bodyPickRenderer`'s module header).
   */
  beginSubmit(): void;
  /**
   * Record ONE body sphere into an already-begun r32uint pick pass; safe to
   * call repeatedly across a submit (`beginSubmit` to the next `beginSubmit`)
   * — each call gets its own slot, even across different passes.
   */
  drawSphere(pass: GPURenderPassEncoder, args: BodySpherePickArgs): void;
  /**
   * Record a sub-pixel body POINT partition as one instanced pick-billboard
   * draw; safe to call multiple times per submit (once per caller: the scene
   * stars + the body glints). No-op on an empty batch (costs no slot).
   */
  drawPoints(pass: GPURenderPassEncoder, args: BodyPointPickArgs): void;
};
