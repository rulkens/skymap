import { describe, expect, it } from 'vitest';
import { packSatelliteProfiles } from '../../../../../src/layers/satellites/points/render/packSatelliteProfiles';
import { SATELLITE_PROFILES } from '../../../../../src/layers/satellites/points/data/satelliteProfiles';
import type { SatelliteProfileId } from '../../../../../src/layers/satellites/points/@types/SatelliteProfileId';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

describe('packSatelliteProfiles', () => {
  it('writes each row at its stride', () => {
    const colors = Object.fromEntries(
      SATELLITE_PROFILES.map(({ id }) => [id, [0, 0, 0] as Vec3]),
    ) as Record<SatelliteProfileId, Vec3>;
    colors['starlink-v2-mini'] = [0.25, 0.5, 0.75];

    const table = packSatelliteProfiles(colors);

    expect(table.length).toBe(128);
    expect([...table.subarray(8, 11)]).toEqual([0.25, 0.5, 0.75]);
    expect(table[11]).toBeCloseTo(SATELLITE_PROFILES[1]!.areaM2, 3);
    expect(table[12]).toBe(SATELLITE_PROFILES[1]!.glintGain);
    // Row 10 is debris: no panels to flash.
    expect(table[10 * 8 + 3]).toBe(SATELLITE_PROFILES[10]!.areaM2);
    expect(table[10 * 8 + 4]).toBe(SATELLITE_PROFILES[10]!.glintGain);
  });
});
