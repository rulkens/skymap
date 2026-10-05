/**
 * blendEncounterToDE441 — pull a Sun-chain craft track onto DE441 around one encounter, in
 * place. Horizons' craft vectors follow the craft file's own planet chain, so against the DE441
 * planets the app draws they are off by up to 13,000 km at Neptune. The DE441 position is the
 * craft against the system barycentre plus the barycentre against the Sun; the track moves
 * `w(t)` of the way there (`encounterBlendWeight`). Velocity gets the same blend plus the
 * `dw/dt · offset` term, so it stays the derivative of the blended position.
 * Returns the largest position change in km.
 */
import type { SampledTrack } from '../../src/@types/scene/SampledTrack';
import type { HorizonsVectorRow } from '../parsers/@types/HorizonsVectorRow';
import { julianDaysToUnixMs } from '../../src/utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../src/utils/time/unixMsToJulianDays';
import { encounterBlendWeight } from '../utils/math/encounterBlendWeight';
import { encounterBlendWeightRate } from '../utils/math/encounterBlendWeightRate';

const SECONDS_PER_DAY = 86_400;
const key = (jd: number): number => Math.round(julianDaysToUnixMs(jd));

export function blendEncounterToDE441(
  track: SampledTrack,
  date: string,
  craftVsBary: readonly HorizonsVectorRow[],
  baryVsSun: readonly HorizonsVectorRow[],
): number {
  const centreJd = unixMsToJulianDays(Date.parse(`${date}T00:00Z`));
  const bary = new Map(baryVsSun.map((r) => [key(r.jd), r]));
  const rel = new Map(craftVsBary.map((r) => [key(r.jd), r]));
  const pos = track.posKm as Float64Array;
  const vel = track.velKmS as Float32Array;
  let maxKm = 0;
  for (let i = 0; i < track.tDays.length; i++) {
    const dt = track.tDays[i]! - centreJd;
    const w = encounterBlendWeight(dt);
    if (w === 0) continue;
    const b = bary.get(key(track.tDays[i]!));
    const c = rel.get(key(track.tDays[i]!));
    if (!b || !c) throw new Error(`blendEncounterToDE441: no DE441 sample at jd ${track.tDays[i]}`);
    const de = [c.xKm + b.xKm, c.yKm + b.yKm, c.zKm + b.zKm];
    const deVel = [c.vxKmS! + b.vxKmS!, c.vyKmS! + b.vyKmS!, c.vzKmS! + b.vzKmS!];
    const wRate = encounterBlendWeightRate(dt) / SECONDS_PER_DAY;
    let moved = 0;
    for (let a = 0; a < 3; a++) {
      const offset = de[a]! - pos[3 * i + a]!;
      vel[3 * i + a] = vel[3 * i + a]! + w * (deVel[a]! - vel[3 * i + a]!) + wRate * offset;
      pos[3 * i + a] = pos[3 * i + a]! + w * offset;
      moved += (w * offset) ** 2;
    }
    maxKm = Math.max(maxKm, Math.sqrt(moved));
  }
  return maxKm;
}
