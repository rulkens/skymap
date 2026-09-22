import type { Vec2 } from '../../math/Vec2';
import type { BodyPointPick } from './BodyPointPick';
import type { BodyGlintPick } from './BodyGlintPick';

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
      /** The DRAWN view's pixels per radian — the camera prefix's focal term. */
      readonly pxPerRad: number;
      /** The scene-star point-partition bodies to draw (≤25). One packed id per instance. */
      readonly points: readonly BodyPointPick[];
      /** Defaults to `'sceneStar'` so existing callers are unchanged. */
      readonly variant?: 'sceneStar';
    }
  | {
      readonly vp: Float32Array;
      readonly viewportPx: Vec2;
      readonly pxPerRad: number;
      /** The glint points to draw (≤25). Each carries its REQUIRED `bandClass`. */
      readonly points: readonly BodyGlintPick[];
      readonly variant: 'glint';
    };
