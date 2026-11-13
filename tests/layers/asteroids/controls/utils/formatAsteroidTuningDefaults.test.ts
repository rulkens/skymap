import { describe, expect, it } from 'vitest';
import { formatAsteroidTuningDefaults } from '../../../../../src/layers/asteroids/controls/utils/formatAsteroidTuningDefaults';
import { initialState } from '../../../../../src/layers/asteroids/state/asteroidTuning/initialState';
import { scaleToLuminance } from '../../../../../src/utils/color/scaleToLuminance';
import { rec709Luminance } from '../../../../../src/utils/color/rec709Luminance';
import { hexToLinearRgb } from '../../../../../src/utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../../../../src/utils/color/linearRgbToHex';
import { scaleToUnitMax } from '../../../../../src/utils/color/scaleToUnitMax';

describe('formatAsteroidTuningDefaults', () => {
  it('emits only the moved values, grouped under their table names, float tails tidied', () => {
    const text = formatAsteroidTuningDefaults({
      ...initialState,
      limitingMag: 16.300000000000001,
      dotRadiusPx: 2,
      sizeKneeH: 11,
      colorBy: 'semiMajorAxis',
      colors: { ...initialState.colors, hilda: [0.1, 0.2, 0.30000004] },
      beltRamp: { ...initialState.beltRamp, outer: [0.5, 0.6, 0.7] },
    });
    expect(text).toBe(
      '// ASTEROID_PHOTOMETRY\nlimitingMag: 16.3,\n' +
        '// ASTEROID_POINT_STYLE\ndotRadiusPx: 2,\nsizeKneeH: 11,\n' +
        '// ASTEROID_CLASS_COLORS\nhilda: [0.1, 0.2, 0.3],\n' +
        '// ASTEROID_BELT_RAMP\nouter: [0.5, 0.6, 0.7],',
    );
  });

  it('emits nothing for a default hue re-picked through the row, which keeps its luminance', () => {
    const tint = initialState.colors.jupiterTrojan;
    const picked = hexToLinearRgb(linearRgbToHex(scaleToUnitMax(tint)));
    const repicked = scaleToLuminance(picked, rec709Luminance(tint));
    expect(rec709Luminance(repicked)).toBeCloseTo(rec709Luminance(tint), 9);
    expect(
      formatAsteroidTuningDefaults({
        ...initialState,
        colors: { ...initialState.colors, jupiterTrojan: repicked },
      }),
    ).toBe('');
  });
});
