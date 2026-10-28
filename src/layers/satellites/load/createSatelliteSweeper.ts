/**
 * createSatelliteSweeper — the worker's whole job, kept free of `self` so Node tests run it: build
 * one satrec per catalog object once, then propagate all of them to a sim instant on each call.
 * Calls `sgp4` with minutes since each object's own epoch rather than `propagate(date)`: a `Date`
 * holds whole milliseconds, 7 m of low-orbit travel each.
 */
import { sgp4 } from './satelliteJsCore';
import { satrecOf } from './satrecOf';
import { HUBBLE_NORAD_ID } from '../../../data/satellites/hubbleNoradId';
import type { SatelliteCatalog } from '../../../@types/satellites/SatelliteCatalog';

const MS_PER_MINUTE = 60_000;

export function createSatelliteSweeper(cat: SatelliteCatalog): {
  readonly count: number;
  sweep(simMs: number): { posKm: Float32Array; velKmS: Float32Array; valid: Uint8Array };
} {
  const count = cat.noradId.length;
  const recs = Array.from({ length: count }, (_, k) => satrecOf(cat, k));
  const drawn = Uint8Array.from(cat.noradId, (id) => (id === HUBBLE_NORAD_ID ? 0 : 1));

  return {
    count,
    sweep(simMs) {
      const posKm = new Float32Array(3 * count);
      const velKmS = new Float32Array(3 * count);
      const valid = new Uint8Array(count);
      for (let k = 0; k < count; k++) {
        if (drawn[k] === 0) continue;
        const state = sgp4(recs[k]!, (simMs - cat.epochMs[k]!) / MS_PER_MINUTE);
        if (state === null) continue;
        const { position: p, velocity: v } = state;
        if (!Number.isFinite(p.x + p.y + p.z)) continue;
        posKm.set([p.x, p.y, p.z], 3 * k);
        velKmS.set([v.x, v.y, v.z], 3 * k);
        valid[k] = 1;
      }
      return { posKm, velKmS, valid };
    },
  };
}
