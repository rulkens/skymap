/**
 * tempColor — stellar blackbody-ish colour ramp: `t` in [0,1] maps cool (red)
 * to hot (blue) through six hand-picked stops. Ported verbatim from the
 * spike's `galaxy-color.js:6-26`.
 *
 * Writes into `out` instead of returning a fresh `Vec3` — a deliberate
 * perf carve-out from this codebase's prefer-immutability convention. The
 * generator calls this once per star, so on the order of 10^6 times per
 * galaxy; allocating a tuple per call would put real GC pressure on a hot
 * loop for no benefit, since every call site already has a slot (the star's
 * colour Vec3) it's about to write into anyway.
 */
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Stellar colour ramp: t=0 coolest (red) -> t=1 hottest (blue). Module-local
// const, not exported — nothing outside this file needs the raw stop table,
// only the interpolated sample.
const COLOR_STOPS: readonly Vec3[] = [
  [1.0, 0.36, 0.16],
  [1.0, 0.58, 0.28],
  [1.0, 0.83, 0.55],
  [1.0, 0.97, 0.9],
  [0.79, 0.86, 1.0],
  [0.6, 0.72, 1.0],
];

/**
 * Sample the stellar colour ramp into `out`.
 *
 * @param t   0 = coolest (red), 1 = hottest (blue). Clamped to [0, 0.999]
 *            before scaling so the index into `COLOR_STOPS` never runs past
 *            the final stop (a t of exactly 1 would otherwise index one past
 *            the end).
 * @param out Destination Vec3, written in place.
 */
export function tempColor(t: number, out: Vec3): void {
  const scaled = Math.max(0, Math.min(0.999, t)) * (COLOR_STOPS.length - 1);
  const i = scaled | 0;
  const f = scaled - i;
  const a = COLOR_STOPS[i]!;
  const b = COLOR_STOPS[i + 1]!;
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
}
