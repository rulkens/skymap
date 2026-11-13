/**
 * BloomPyramid — the dual-filter bloom mip pyramid (bright prefilter, Karis
 * downsample, additive tent upsample, strength-scaled fold) plus the film
 * look's streak and veil passes. It owns pipelines, sampler and uniforms but
 * NO textures: those are `renderTargets` rows recreated on resize, so every
 * method takes its source view and records one draw into a pass the caller
 * opened against the target. `srcTexelSize` is `1 / source-pixel-size`, so tap
 * offsets are in the SOURCE level's texels. `runBloom` holds the pass order;
 * why each draw has its own uniform buffer is in `bloomPyramid.ts`'s header.
 */

import type { Vec2 } from '../math/Vec2';
import type { BrightParams } from './BrightParams';
import type { FoldKind } from './FoldKind';
import type { StreakTaps } from './StreakTaps';

export type BloomPyramid = {
  readonly label: string;
  /** hdr → bloom0: soft threshold plus the firefly cap. */
  bright(pass: GPURenderPassEncoder, srcView: GPUTextureView, params: BrightParams): void;
  /** `bloom[level-1]` → `bloom[level]` (1..4), overwriting; `karis` on level 1 only. */
  downsample(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    level: number,
    srcTexelSize: Vec2,
    karis: boolean,
  ): void;
  /** `bloom[level+1]` → `bloom[level]` (3..0), added onto what the downsample wrote. */
  upsample(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    level: number,
    srcTexelSize: Vec2,
  ): void;
  /**
   * Adds `kind`'s glow source (bloom0, streak0 or veil1) into the bound hdr
   * target, scaled by that kind's `strength` (0 = no glow).
   */
  fold(pass: GPURenderPassEncoder, srcView: GPUTextureView, kind: FoldKind, strength: number): void;
  /** One anamorphic streak iteration: a horizontal smear, overwriting the target. */
  streak(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    iteration: 0 | 1 | 2,
    taps: StreakTaps,
  ): void;
  /** One axis of the veiling-glare Gaussian, overwriting the target. */
  veil(
    pass: GPURenderPassEncoder,
    srcView: GPUTextureView,
    axis: 'x' | 'y',
    srcTexelSize: Vec2,
  ): void;
  /** Releases the uniform buffers; the rest is GC'd. */
  destroy(): void;
};
