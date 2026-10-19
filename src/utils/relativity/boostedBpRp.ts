/**
 * boostedBpRp — the BP−RP colour a star shows at Doppler factor `d`: its temperature times `d`.
 * Approximation: the star is a blackbody whose T is read off the tint ramp's own anchors
 * (`STAR_TINT_BLACKBODY_ANCHORS`), log T piecewise-linear in BP−RP, and `D · T` read back through
 * the same table, clamped at its ends. The CPU twin of `lib/boost.wesl`'s `boostedBpRp`.
 */

import { STAR_TINT_BLACKBODY_ANCHORS as ANCHORS } from '../../data/voyage/starTintBlackbodyAnchors';

const saturate = (t: number): number => Math.min(1, Math.max(0, t));

export function boostedBpRp(bpRp: number, d: number): number {
  // Exact identity at rest, out-of-table colours included.
  if (d === 1) return bpRp;
  let logT = Math.log(ANCHORS[0].temperatureK);
  for (let i = 1; i < ANCHORS.length; i++) {
    const lo = ANCHORS[i - 1]!;
    const hi = ANCHORS[i]!;
    const t = saturate((bpRp - lo.bpRp) / (hi.bpRp - lo.bpRp));
    logT += t * (Math.log(hi.temperatureK) - Math.log(lo.temperatureK));
  }
  const seen = logT + Math.log(d);
  let out: number = ANCHORS[0].bpRp;
  for (let i = 1; i < ANCHORS.length; i++) {
    const lo = ANCHORS[i - 1]!;
    const hi = ANCHORS[i]!;
    const loLog = Math.log(lo.temperatureK);
    const t = saturate((loLog - seen) / (loLog - Math.log(hi.temperatureK)));
    out += t * (hi.bpRp - lo.bpRp);
  }
  return out;
}
