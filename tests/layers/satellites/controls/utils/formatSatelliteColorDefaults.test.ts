import { describe, expect, it } from 'vitest';
import { formatSatelliteColorDefaults } from '../../../../../src/layers/satellites/controls/utils/formatSatelliteColorDefaults';
import { SATELLITE_PROFILES } from '../../../../../src/layers/satellites/points/data/satelliteProfiles';
import { linearRgbToHex } from '../../../../../src/utils/color/linearRgbToHex';
import { hexToLinearRgb } from '../../../../../src/utils/color/hexToLinearRgb';
import type { SatelliteColors } from '../../../../../src/layers/satellites/@types/SatelliteColors';

const DEFAULTS = Object.fromEntries(
  SATELLITE_PROFILES.map(({ id, color }) => [id, color]),
) as SatelliteColors;

describe('formatSatelliteColorDefaults', () => {
  it('emits each changed row whole, in the table literal form', () => {
    const colors: SatelliteColors = { ...DEFAULTS, oneweb: [0.1, 0.2, 0.3], geo: [1, 0, 0.25] };
    expect(formatSatelliteColorDefaults(colors)).toBe(
      "{ id: 'oneweb', label: 'OneWeb', color: [0.1, 0.2, 0.3], areaM2: 3.88, glintGain: 1 },\n" +
        "{ id: 'geo', label: 'Geostationary', color: [1, 0, 0.25], areaM2: 71, glintGain: 1 },",
    );
  });

  it('emits nothing when no colour moved', () => {
    expect(formatSatelliteColorDefaults(DEFAULTS)).toBe('');
  });

  it('emits nothing for a default re-picked through its hex', () => {
    const repicked = { ...DEFAULTS, leo: hexToLinearRgb(linearRgbToHex(DEFAULTS.leo)) };
    expect(formatSatelliteColorDefaults(repicked)).toBe('');
  });

  it('its output parses as array elements, with picker float tails rounded', () => {
    const colors: SatelliteColors = { ...DEFAULTS, 'starlink-v1': [0.123456789, 0.5, 1] };
    const text = formatSatelliteColorDefaults(colors);
    expect(new Function(`return [\n${text}\n];`)()).toEqual([
      {
        id: 'starlink-v1',
        label: 'Starlink V1',
        color: [0.1235, 0.5, 1],
        areaM2: 22.68,
        glintGain: 1,
      },
    ]);
  });
});
