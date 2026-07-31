/**
 * OrbitTrailRenderer — the instanced screen-space conic orbit-trail renderer's
 * public contract (spec `2026-07-11-conic-orbit-trails.md` §6; ribbon
 * impostor `2026-07-31-orbit-trail-ribbon-impostor.md` §2.4).
 *
 * ### Why `draw` takes a raw `Float32Array` + two counts
 *
 * The caller packs one per-instance record per orbit — `Ginv` (three padded
 * `mat3x3` columns), the trail params, and the clip basis `Cc`/`Ac`/`Bc` —
 * into one flat `Float32Array`, with ribbon-eligible records at the FRONT and
 * fallback records at the BACK (unwritten slots may sit between). The
 * renderer streams it as instance-step vertex attributes and issues up to two
 * instanced draws — a cheap screen-space ribbon for the bounded orbits, the
 * fullscreen-triangle fallback for the rest — with ONE `writeBuffer` covering
 * both partitions, so there is no per-orbit uniform for a later write to
 * clobber (the writeBuffer-vs-submit landmine). The GPU-side instance buffer
 * grows to fit the largest slot count seen so far — no fixed cap.
 */

import type { Renderer } from './Renderer';

export type OrbitTrailRenderer = Renderer & {
  /**
   * Draw `ribbonCount` ribbon-eligible orbit trails followed by
   * `fallbackCount` fullscreen-fallback trails into the caller's additive HDR
   * pass. `instances` is a packed 40-float / 160-byte-stride record per orbit
   * (see the renderer's instance-attribute table); ribbon records occupy
   * `instances[0 .. ribbonCount)`, fallback records occupy the LAST
   * `fallbackCount` slots. `ribbonCount + fallbackCount` must not exceed
   * `instances.length / 40` — the renderer throws rather than read past the
   * caller's array; either count may be 0, and both 0 is a no-op.
   */
  draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    ribbonCount: number,
    fallbackCount: number,
  ): void;
};
