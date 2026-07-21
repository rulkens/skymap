/**
 * BloomPyramid — the handle for the dual-filter bloom mip pyramid: a bright
 * prefilter plus the descending (downsample) and ascending (upsample) halves
 * of a Marius Bjorge / 'Next Generation Post Processing in Call of Duty'
 * pyramid blur.
 *
 * The factory owns the three pipelines (bright, downsample, upsample), the
 * linear sampler, and the per-level texel-size uniform buffers. It owns NO
 * textures: the bloom mip textures are `renderTargets` rows (`bloom0..bloom4`),
 * recreated on resize, and every method takes the source view as a parameter
 * so a resize needs no bookkeeping here (bind groups are rebuilt per draw).
 *
 * ### The three stages and how a frame drives them
 *
 * A caller opens one render pass per bloom target and records exactly one of
 * these draws into it:
 *
 *   - `bright`  reads the HDR scene, writes `bloom0` — the prefilter that keeps
 *              only above-threshold light so dim structure stays crisp.
 *   - `downsample` at level L (1..4) reads `bloom[L-1]`, writes `bloom[L]` —
 *              halving resolution while blurring, four times, building the mip
 *              chain. `karis` is true only for level 1 (the firefly-suppressing
 *              Karis average belongs on the level-0 read where raw fireflies
 *              live; deeper levels are already smooth).
 *   - `upsample` at level L (3..0) reads the coarser `bloom[L+1]`, ADDITIVELY
 *              folds its wider blur onto `bloom[L]`. The accumulation of every
 *              level's progressively-wider tent is what gives bloom its soft
 *              multi-scale falloff.
 *
 * `srcTexelSize` is `1 / source-pixel-size` (a `Vec2`), so the shaders' tap
 * offsets are measured in the SOURCE level's texels — the filter kernel widens
 * naturally as the pyramid shrinks.
 */

import type { Vec2 } from '../math/Vec2';

export type BloomPyramid = {
  readonly label: string;
  /**
   * Bright prefilter: reads `srcView` (the HDR scene), writes into the bound
   * `bloom0` target. Records `setPipeline`/`setBindGroup`/`draw` into an
   * already-open pass; the caller owns the pass lifecycle. Uses a single
   * uniform buffer (safe because it is drawn once per frame — no intra-frame
   * reuse, so no writeBuffer/submit race).
   *
   * @param threshold Max-channel luma below which a pixel contributes nothing.
   */
  bright(pass: GPURenderPassEncoder, srcView: GPUTextureView, threshold: number): void;
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
   * No-op — sampler, bind-group-layout, pipelines, and the small uniform
   * buffers are GC'd when their last reference drops. Present for teardown
   * symmetry with the other GPU-resource owners.
   */
  destroy(): void;
};
