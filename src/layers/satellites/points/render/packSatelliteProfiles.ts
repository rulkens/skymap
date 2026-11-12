/**
 * packSatelliteProfiles — the GPU profile table as floats, one row per `SATELLITE_PROFILES` entry
 * at its code. TS twin of `SatelliteProfile` in satellites/points/io.wesl, pinned by
 * satellitePoints.parity.test.ts. Colours come in separately because they are tunable; area and
 * glint gain are not. Rows past the table stay zero.
 */
import type { SatelliteColors } from '../../@types/SatelliteColors';
import { SATELLITE_PROFILES } from '../data/satelliteProfiles';
import { SATELLITE_PROFILE_CAPACITY } from '../data/satelliteProfileCapacity';

/** A vec3 and two floats occupy 20 bytes; a uniform array rounds the struct to its 16-byte align. */
export const SATELLITE_PROFILE_BYTES = 32;

export function packSatelliteProfiles(colors: SatelliteColors): Float32Array {
  const rowFloats = SATELLITE_PROFILE_BYTES / 4;
  const table = new Float32Array(SATELLITE_PROFILE_CAPACITY * rowFloats);
  SATELLITE_PROFILES.forEach(({ id, areaM2, glintGain }, code) => {
    const at = code * rowFloats;
    table.set(colors[id], at);
    table[at + 3] = areaM2;
    table[at + 4] = glintGain;
  });
  return table;
}
