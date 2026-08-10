/**
 * The light decomposition is what every amplitude in the analytic field is a
 * fraction OF, so the two ways it can be wrong are both silent: lanes that do
 * not sum to 1 rescale the whole galaxy against `luminosity`, and light in a
 * lane whose geometry the generator never builds is light nothing emits.
 * Neither shows in the mixture's own ledger, which measures what was pushed.
 */
import { describe, expect, it } from 'vitest';
import { barLengthOf } from '../../../../../src/services/engine/galaxyGenerator/shared/barLengthOf';
import { classifyHubbleType } from '../../../../../src/services/engine/galaxyGenerator/shared/classifyHubbleType';
import { galaxyLightDecomposition } from '../../../../../src/services/engine/galaxyGenerator/shared/galaxyLightDecomposition';
import type { GalaxyParams } from '../../../../../src/@types/galaxy/GalaxyParams';

/** The tool's full type roster plus the stages only an interpolated T reaches. */
const TYPES: readonly string[] = [
  'Sa',
  'Sb',
  'Sbc',
  'Sc',
  'Sd',
  'SBa',
  'SBb',
  'SBbc',
  'SBc',
  'E0',
  'E7',
  'S0',
  'Irr',
  'not-a-type',
];

const BAR_STRENGTHS: readonly (number | undefined)[] = [undefined, 0, 0.6, 1];

function cases(): GalaxyParams[] {
  return TYPES.flatMap((type) =>
    BAR_STRENGTHS.map((barStrength) => ({ type, shared: { barStrength } })),
  );
}

describe('galaxyLightDecomposition', () => {
  it.each(cases())(
    '$type at barStrength $shared.barStrength divides all of the light',
    (params) => {
      const light = galaxyLightDecomposition(classifyHubbleType(params.type), params);
      expect(light.bulge + light.bar + light.disc + light.halo).toBeCloseTo(1, 12);
      for (const lane of Object.values(light)) expect(lane).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(cases())(
    '$type at barStrength $shared.barStrength lights no bar it does not build',
    (params) => {
      const category = classifyHubbleType(params.type);
      const light = galaxyLightDecomposition(category, params);
      if (light.bar > 0) {
        expect(barLengthOf(category, 10, params.shared.barStrength)).toBeGreaterThan(0);
      }
    },
  );

  // An elliptical has no disk builder at all — `splitStarBudget` would carve a
  // range for it and `pushDisc` would grow an exponential disc on a spheroid.
  it.each(['E0', 'E7'])('%s puts none of its light in a disc', (type) => {
    expect(galaxyLightDecomposition('elliptical', { type, shared: {} }).disc).toBe(0);
  });

  // Bar-ness is not part of the RC3 stage, so a barred galaxy and its unbarred
  // twin read the same row and differ by exactly the bar lane, which comes out
  // of the disc. Fails if `hubbleStageOf` mishandles the 'B' — which would put
  // every barred galaxy in the wrong row without changing any total.
  it.each([
    ['Sa', 'SBa'],
    ['Sb', 'SBb'],
    ['Sc', 'SBc'],
  ])('%s and %s differ by the bar lane alone', (plain, barred) => {
    const unbarred = galaxyLightDecomposition('spiral', { type: plain, shared: {} });
    const withBar = galaxyLightDecomposition('barred', { type: barred, shared: {} });
    expect(withBar.bulge).toBe(unbarred.bulge);
    expect(withBar.halo).toBe(unbarred.halo);
    expect(withBar.bar).toBeGreaterThan(0);
    expect(withBar.disc + withBar.bar).toBeCloseTo(unbarred.disc, 12);
  });
});
