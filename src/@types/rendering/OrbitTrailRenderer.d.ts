/**
 * OrbitTrailRenderer — the instanced screen-space conic orbit-trail renderer's
 * public contract (spec `2026-07-11-conic-orbit-trails.md` §6).
 *
 * ### Why `draw` takes a raw `Float32Array` + count
 *
 * Same shape as `OrbitRingRenderer` (the twin this replaces): the caller packs
 * up to `MAX_ORBITS` per-instance records — the pixel→plane inverse homography
 * `Ginv` (three padded `mat3x3` columns) plus the trail params — into one flat
 * `Float32Array` and hands it over with a live `count`. The renderer streams it
 * as instance-step vertex attributes in ONE `writeBuffer` + ONE instanced
 * `draw`, so there is no per-orbit uniform for a later write to clobber (the
 * writeBuffer-vs-submit landmine). The array-shaped signature keeps the layer
 * that composes `Ginv` (in `f64`, per frame) free to reuse one scratch buffer.
 */

import type { Renderer } from './Renderer';

export type OrbitTrailRenderer = Renderer & {
  /**
   * Draw the first `count` orbit trails into the caller's additive HDR pass.
   * `instances` is a packed 20-float / 80-byte-stride record per orbit (the
   * `Ginv` columns + colour/eccentricity + mean anomaly — see the renderer's
   * instance-attribute table). `count` is clamped to `MAX_ORBITS`; a zero
   * count is a no-op.
   */
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void;
};
