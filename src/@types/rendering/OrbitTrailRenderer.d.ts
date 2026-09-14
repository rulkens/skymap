/**
 * OrbitTrailRenderer — the instanced screen-space conic orbit-trail renderer's
 * public contract (spec `2026-07-11-conic-orbit-trails.md` §6; ribbon
 * impostor `2026-07-31-orbit-trail-ribbon-impostor.md` §2.4/Task 12).
 *
 * ### Why `draw` takes a raw `Float32Array` + one count
 *
 * The caller packs one per-instance record per orbit — `Ginv` (three padded
 * `mat3x3` columns), the trail params, the clip basis `Cc`/`Ac`/`Bc`, the
 * CPU-clipped visible arc `[eStart, eSpan]`, and the eye-relative 3D basis
 * the occlusion test rebuilds orbit points from — into one flat
 * `Float32Array`. The renderer streams it as instance-step vertex attributes
 * and issues one instanced draw — a screen-space ribbon sampled only across
 * each orbit's closed-form in-front-of-camera arc, which covers every
 * projection including a camera inside the orbit, so there is no second
 * fallback pipeline — with ONE `writeBuffer`, so there is no per-orbit
 * uniform for a later write to clobber (the writeBuffer-vs-submit landmine).
 * The GPU-side instance buffer grows to fit the largest slot count seen so
 * far — no fixed cap. The frame's occluder spheres are the one uniform, and
 * they are per FRAME, written once per draw.
 */

import type { Renderer } from './Renderer';

export type OrbitTrailRenderer = Renderer & {
  /**
   * Draw `count` orbit trails into the caller's additive HDR pass.
   * `instances` is a packed 46-float / 184-byte-stride record per orbit (see
   * the renderer's instance-attribute table); `count` must not exceed
   * `instances.length / 46` — the renderer throws rather than read past the
   * caller's array; `count` may be 0, which is a no-op.
   *
   * `occluders` is the frame's opaque-body sphere list the fragment hides
   * trail segments behind: `selectOccluderSpheresKm`'s packing (eye-relative
   * xyz + radius, km, four floats each), `count` live entries, at most
   * `MAX_ORBIT_OCCLUDERS`.
   *
   * `showImpostor` (default `false`, the
   * `debug.overlays['orbit-trail-impostor']` toggle) issues one ADDITIONAL
   * debug draw — the ribbon hull's flat fill —
   * with the SAME vertex count as the production draw, so the overlay lands
   * exactly on the real geometry as a lens over it, never a replacement. The
   * debug pipeline builds lazily on first `true`, so leaving the flag off
   * costs production nothing.
   */
  draw(
    pass: GPURenderPassEncoder,
    instances: Float32Array,
    count: number,
    occluders: { readonly count: number; readonly spheresKm: Float32Array },
    showImpostor?: boolean,
  ): void;
};
