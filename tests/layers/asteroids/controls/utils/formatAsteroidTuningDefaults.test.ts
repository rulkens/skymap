import { describe, expect, it } from 'vitest';
import { formatAsteroidTuningDefaults } from '../../../../../src/layers/asteroids/controls/utils/formatAsteroidTuningDefaults';
import { initialState } from '../../../../../src/layers/asteroids/state/asteroidTuning/initialState';
import { scaleToLuminance } from '../../../../../src/utils/color/scaleToLuminance';
import { rec709Luminance } from '../../../../../src/utils/color/rec709Luminance';
import { hexToLinearRgb } from '../../../../../src/utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../../../../src/utils/color/linearRgbToHex';
import { scaleToUnitMax } from '../../../../../src/utils/color/scaleToUnitMax';

describe('formatAsteroidTuningDefaults', () => {
  it('emits the moved per-class rows under their class, then the global rows under their table', () => {
    const { hilda, mainBelt } = initialState.perClass;
    const text = formatAsteroidTuningDefaults({
      ...initialState,
      perClass: {
        ...initialState.perClass,
        hilda: { ...hilda, limitingMag: 17.300000000000001, color: [0.1, 0.2, 0.30000004] },
        mainBelt: { ...mainBelt, brightness: 1.5 },
      },
      liftPerAu2: 8000,
      thinBudget: 200_000,
      colorBy: 'semiMajorAxis',
      beltRamp: { ...initialState.beltRamp, outer: [0.5, 0.6, 0.7] },
    });
    expect(text).toBe(
      '// ASTEROID_CLASS_LOOK.mainBelt\nbrightness: 1.5,\n' +
        '// ASTEROID_CLASS_LOOK.hilda\nlimitingMag: 17.3,\ncolor: [0.1, 0.2, 0.3],\n' +
        '// ASTEROID_PHOTOMETRY\nliftPerAu2: 8000,\n' +
        '// ASTEROID_THINNING\nthinBudget: 200000,\n' +
        '// ASTEROID_BELT_RAMP\nouter: [0.5, 0.6, 0.7],',
    );
  });

  it('emits nothing for a default hue re-picked through the row, which keeps its luminance', () => {
    const trojan = initialState.perClass.jupiterTrojan;
    const picked = hexToLinearRgb(linearRgbToHex(scaleToUnitMax(trojan.color)));
    const repicked = scaleToLuminance(picked, rec709Luminance(trojan.color));
    expect(rec709Luminance(repicked)).toBeCloseTo(rec709Luminance(trojan.color), 9);
    expect(
      formatAsteroidTuningDefaults({
        ...initialState,
        perClass: { ...initialState.perClass, jupiterTrojan: { ...trojan, color: repicked } },
      }),
    ).toBe('');
  });
});
