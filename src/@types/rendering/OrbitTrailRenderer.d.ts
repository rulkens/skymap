/**
 * OrbitTrailRenderer — the instanced screen-space conic orbit-trail renderer's
 * public contract (spec `2026-07-11-conic-orbit-trails.md` §6).
 *
 * ### Why `draw` takes a raw `Float32Array` + count
 *
 * The caller packs one per-instance record per orbit — the pixel→plane inverse
 * homography `Ginv` (three padded `mat3x3` columns) plus the trail params —
 * into one flat `Float32Array` and hands it over with a live `count`. The
 * renderer streams it as instance-step vertex attributes in ONE `writeBuffer` +
 * ONE instanced `draw`, so there is no per-orbit uniform for a later write to
 * clobber (the writeBuffer-vs-submit landmine). The array-shaped signature
 * keeps the layer that composes `Ginv` (in `f64`, per frame) free to reuse one
 * scratch buffer. The GPU-side instance buffer grows to fit the largest
 * `count` seen so far — there is no fixed cap on how many orbits can be drawn.
 */

import type { Renderer } from './Renderer';

export type OrbitTrailRenderer = Renderer & {
  /**
   * Draw `count` orbit trails into the caller's additive HDR pass. `instances`
   * is a packed 28-float / 112-byte-stride record per orbit (the `Ginv`
   * columns + colour/eccentricity + mean anomaly + the two gradient-minor
   * triples — see the renderer's instance-attribute table). `count` must not
   * exceed `instances.length / 28` — the renderer throws rather than read past
   * the caller's array; a zero count is a no-op.
   */
  draw(pass: GPURenderPassEncoder, instances: Float32Array, count: number): void;
};
