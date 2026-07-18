/**
 * BodyGlintRenderer — handle for the sub-pixel scene bodies drawn as
 * brightness-scaled additive point sprites into the depthless HDR accumulation.
 *
 * This is the far half of the body LOD: a planet/moon too small to resolve as a
 * mesh renders as a screen-aligned soft dot whose brightness encodes apparent
 * size x albedo x phase, tinted by the body's albedo — the same visual species
 * as `starPointRenderer`'s scene stars, through a thin dedicated pipeline. It is
 * the close sibling of `starPointRenderer` (near-identical additive point
 * pipeline with the same camera-relative f64-rebase seam), DELIBERATELY kept a
 * separate renderer for this feature rather than folded into it — the fold
 * candidate is flagged in the spec (§14). It draws into the depthless `hdr`
 * target with one/one additive blending, NOT the opaque foreground pass, so a
 * glint that fades to zero adds nothing and overlapping glints brighten.
 *
 * Unlike `starPointRenderer`'s `setStars` + `draw`, this renderer takes the
 * packed instance batch straight in `draw` (the `planetRenderer` idiom): the
 * layer recomputes each glint's brightness and camera-relative anchor every
 * frame, so there is no upload-on-change step — one `writeBuffer` + one
 * instanced draw per frame. The layer hands positions already camera-relative
 * (paired with a rebased view-projection) so the f32 narrowing carries no
 * catastrophic cancellation.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';

export type BodyGlintRenderer = Renderer & {
  /**
   * Draw `count` glints from the packed `instances` batch as instanced
   * billboards into the current (depthless, additive) pass. Each 7-float record
   * is `position` (f32x3, camera-relative per the layer's rebase), linear-RGB
   * `color` (albedo tint), and `brightness` (f32) — 28 bytes. `viewProj` is the
   * length-16 view-projection rebased into the same camera-relative frame as the
   * anchors; `viewportPx` feeds the pixel-size-to-clip-offset conversion. `count`
   * is clamped to the renderer's cap; a zero `count` is a no-op.
   */
  draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    count: number,
    viewProj: Float32Array,
    viewportPx: Vec2,
  ): void;
};
