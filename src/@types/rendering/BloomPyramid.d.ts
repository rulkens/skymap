/**
 * BloomPyramid — the dual-filter bloom mip pyramid (bright prefilter, Karis
 * downsample, additive tent upsample, strength-scaled fold) plus the film
 * look's streak and veil passes. It owns pipelines, sampler and uniforms but
 * NO textures: those are `renderTargets` rows recreated on resize, so every
 * method takes its source view and records one draw into a pass the caller
 * opened against the target. `srcTexelSize` is `1 / source-pixel-size`, so tap
 * offsets are in the SOURCE level's texels. `runBloom` holds the pass order.
 */

import type { Vec2 } from '../math/Vec2';
import type { BrightParams } from './BrightParams';
import type { FoldKind } from './FoldKind';
import type { StreakTaps } from './StreakTaps';

export type BloomPyramid = {
  readonly label: string;
  /**
   * Bright prefilter: reads `srcView` (the HDR scene), writes into the bound
   * `bloom0` target. Records `setPipeline`/`setBindGroup`/`draw` into an
   * already-open pass; the caller owns the pass lifecycle. Uses a single
   * uniform buffer (safe because it is drawn once per frame — no intra-frame
   * reuse, so no writeBuffer/submit race).
   *
   * @param params Threshold plus the firefly cap and its floor.
   */
  bright(pass: GPURenderPassEncoder, srcView: GPUTextureView, params: BrightParams): void;
  /**
   * Downsample fold `level` (1..4): reads `srcView` (`bloom[level-1]`) and
   * writes the bound `bloom[level]` target opaque (no blend). `srcTexelSize`
   * is `1 / source-pixel-size`; `karis` enables the firefly-suppressing Karis
   * average, true only for level 1 (the level-0 read).
   *
   * `level` selects this stage's per-level uniform buffer, so four downsample
   * draws in one frame each read their own frozen texel size + Karis flag.
   */
  downsample(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    level: number,
    srcTexelSize: Vec2,
    karis: boolean,
  ): void;
  /**
   * Upsample fold `level` (3..0): reads `srcView` (the coarser `bloom[level+1]`)
   * and ADDITIVELY (one/one) accumulates its tent-filtered blur into the bound
   * `bloom[level]` target. `srcTexelSize` is `1 / source-pixel-size`.
   *
   * `level` selects this stage's OWN per-level uniform buffer — separate from
   * the downsample buffers even where the level ranges overlap, because a
   * downsample and an upsample at the same level run in the same frame with
   * different source texel sizes.
   */
  upsample(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    level: number,
    srcTexelSize: Vec2,
  ): void;
  /**
   * Final fold: reads `srcView` (`bloom0`, the accumulated finest level) and
   * ADDITIVELY (one/one) blits it into the bound HDR target, scaled by
   * `strength`. `strength` is `state.settings.bloom.strength`, a per-draw
   * multiply the generic compositor's fixed blend table has no slot for — so
   * the fold lives here rather than as a compositor merge.
   *
   * Uses one uniform buffer per `kind`: each kind is drawn at most once per
   * frame, so there is no intra-frame reuse and no writeBuffer/submit race.
   *
   * @param kind Which glow this fold adds; selects its uniform buffer.
   * @param strength Linear multiplier on the folded glow (0 = no glow).
   */
  fold(pass: GPURenderPassEncoder, srcView: GPUTextureView, kind: FoldKind, strength: number): void;
  /**
   * One anamorphic streak iteration: a horizontal smear of `srcView` that
   * OVERWRITES the bound target. `iteration` selects its own 32-byte uniform,
   * so the three iterations drawn in one frame never share one.
   */
  streak(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    iteration: 0 | 1 | 2,
    taps: StreakTaps,
  ): void;
  /**
   * One axis of the veiling-glare Gaussian over `srcView`, OVERWRITING the
   * bound target; each axis has its own uniform. `srcTexelSize` as above.
   */
  veil(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    axis: 'x' | 'y',
    srcTexelSize: Vec2,
  ): void;
  /**
   * No-op — sampler, bind-group-layout, pipelines, and the small uniform
   * buffers are GC'd when their last reference drops. Present for teardown
   * symmetry with the other GPU-resource owners.
   */
  destroy(): void;
};
