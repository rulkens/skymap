/**
 * fitPlan param keys must address NUMBER fields on GalaxyParams — autoFit's
 * coordinate descent writes a bare number through every key a plan names
 * (`setParamValue`'s `Record<string, number>` cast), so a key that resolves
 * to a nested object (e.g. `dust`, a `GalaxyDustParams`) would silently
 * clobber that whole object on the first fit iteration. The `dust`/
 * `spriteDust` mixup this guards against compiled fine under a bare
 * `keyof GalaxyParams`, so this checks real values, not just types.
 */
import { describe, expect, it } from 'vitest';
import { fitPlan } from '../../../../tools/galaxy-renderer/src/matcher/fitPlan';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import type { GalaxyCategory } from '../../../../src/@types/galaxy/GalaxyCategory';

const CATEGORIES: readonly GalaxyCategory[] = [
  'elliptical',
  'lenticular',
  'irregular',
  'barred',
  'spiral',
];
// Straddles fitPlan's armOK = q > 0.4 gate, which swaps the spiral/barred
// param table's arm-count sweep in and out but not the params list itself —
// covered anyway so a future category split by q doesn't slip past this.
const Q_SAMPLES = [0.2, 0.7];

describe('fitPlan param keys are numeric GalaxyParams fields', () => {
  it('every named key is a number (or legitimately unset) on DEFAULT_GALAXY_PARAMS, never an object', () => {
    const defaults = DEFAULT_GALAXY_PARAMS as unknown as Record<string, unknown>;
    for (const category of CATEGORIES) {
      for (const q of Q_SAMPLES) {
        for (const [key] of fitPlan(category, q).params) {
          const value = defaults[key];
          const ok = value === undefined || typeof value === 'number';
          expect(ok, `${category}/${key}: expected number or unset, got ${typeof value}`).toBe(
            true,
          );
        }
      }
    }
  });
});
