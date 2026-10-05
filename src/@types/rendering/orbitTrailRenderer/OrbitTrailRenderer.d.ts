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

import type { OrbitTrailDrawArgs } from './OrbitTrailDrawArgs';
import type { Renderer } from '../Renderer';

export type OrbitTrailRenderer = Renderer & {
  /**
   * Draw `args.count` orbit trails into the caller's additive HDR pass — see
   * `OrbitTrailDrawArgs`'s fields for the per-argument contract. The bind group
   * holding `args.depth.view` rebuilds only when that view's identity changes.
   */
  draw(pass: GPURenderPassEncoder, args: OrbitTrailDrawArgs): void;
};
