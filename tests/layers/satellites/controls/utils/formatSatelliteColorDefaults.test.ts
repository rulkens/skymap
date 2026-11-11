import { describe, expect, it } from 'vitest';
import { formatSatelliteColorDefaults } from '../../../../../src/layers/satellites/controls/utils/formatSatelliteColorDefaults';
import type { SatelliteColors } from '../../../../../src/layers/satellites/@types/SatelliteColors';

const grey = (): [number, number, number] => [0.5, 0.5, 0.5];
const DEFAULTS: SatelliteColors = {
  'starlink-v1': grey(),
  'starlink-v2-mini': grey(),
  oneweb: grey(),
  kuiper: grey(),
  qianfan: grey(),
  guowang: grey(),
  leo: grey(),
  meo: grey(),
  geo: grey(),
  heo: grey(),
  debris: grey(),
  other: grey(),
};

describe('formatSatelliteColorDefaults', () => {
  it('formatSatelliteColorDefaults emits only changed rows', () => {
    const colors: SatelliteColors = { ...DEFAULTS, oneweb: [0.1, 0.2, 0.3], geo: [1, 0, 0.25] };
    expect(formatSatelliteColorDefaults(colors, DEFAULTS)).toBe(
      "  'oneweb': [0.1, 0.2, 0.3],\n  'geo': [1, 0, 0.25],",
    );
  });

  it('emits nothing when no colour moved, whatever the array identity', () => {
    expect(formatSatelliteColorDefaults({ ...DEFAULTS, leo: grey() }, DEFAULTS)).toBe('');
  });

  it('its output is a valid object-literal fragment', () => {
    // A hyphenated profile id is a syntax error unquoted; a picker float's long tail is rounded.
    const colors: SatelliteColors = { ...DEFAULTS, 'starlink-v1': [0.123456789, 0.5, 1] };
    const text = formatSatelliteColorDefaults(colors, DEFAULTS);
    expect(text).toBe("  'starlink-v1': [0.1235, 0.5, 1],");
    expect(new Function(`return {\n${text}\n};`)()).toEqual({
      'starlink-v1': [0.1235, 0.5, 1],
    });
  });
});
