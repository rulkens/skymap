/**
 * PARAM_SPEC — verbatim port of the spike's SPEC table
 * (`Galaxy Renderer.dc.html:450-461`), plus four keys the spike ranged via
 * `mk()`'s inline fallback args instead of SPEC (`hii`/`dustRing`/
 * `dustRingWidth`/`dustRingStrength`, html:776-782 — see `paramSpec.ts`'s
 * docblock). Every row must be a valid range (min < max, positive step)
 * and every key must be a real `GalaxyParams` field — a typo here would
 * silently produce a dead slider.
 */
import { describe, expect, it } from 'vitest';
import { PARAM_SPEC } from '../../../../tools/galaxy-renderer/src/data/paramSpec';

// The exact key set this port's range table declares: the spike's SPEC
// table (html:450-461) plus the four `mk()`-fallback-only keys appended
// at paramSpec.ts's end (html:776-782), spot-checked by hand against the
// source. A mismatch here (extra or missing key) means the port drifted.
const EXPECTED_KEYS = [
  'radius',
  'starCount',
  'bulgeSize',
  'bulgeFalloff',
  'diskThickness',
  'irregularity',
  'armCount',
  'armWinding',
  'armWidth',
  'armStrength',
  'subArms',
  'armFalloff',
  'armEdgeVar',
  'armClump',
  'armWave',
  'barStrength',
  'dust',
  'dustNoise',
  'dustNoiseScale',
  'youngStars',
  'metallicity',
  'warpStrength',
  'warpTwist',
  'globularCount',
  'globularSize',
  'globularBright',
  // Appended (html:776-782 — mk()'s inline fallback ranges, not SPEC entries).
  'hii',
  'dustRing',
  'dustRingWidth',
  'dustRingStrength',
].sort();

describe('PARAM_SPEC', () => {
  it('every entry has min < max and positive step', () => {
    for (const [key, entry] of Object.entries(PARAM_SPEC)) {
      expect(entry!.min, `${key}.min`).toBeLessThan(entry!.max);
      expect(entry!.step, `${key}.step`).toBeGreaterThan(0);
    }
  });

  it('spot-checks three SPEC-table rows verbatim', () => {
    expect(PARAM_SPEC.radius).toEqual({ min: 0.4, max: 1.8, step: 0.05 });
    expect(PARAM_SPEC.dust).toEqual({ min: 0, max: 0.7, step: 0.05 });
    expect(PARAM_SPEC.warpTwist).toEqual({ min: 0, max: 6.28, step: 0.05 });
  });

  it('spot-checks the four appended mk()-fallback rows verbatim (html:776-782)', () => {
    expect(PARAM_SPEC.hii).toEqual({ min: 0, max: 2, step: 0.05 });
    expect(PARAM_SPEC.dustRing).toEqual({ min: 0.4, max: 1.1, step: 0.02 });
    expect(PARAM_SPEC.dustRingWidth).toEqual({ min: 0.02, max: 0.4, step: 0.01 });
    expect(PARAM_SPEC.dustRingStrength).toEqual({ min: 0, max: 2, step: 0.05 });
  });

  it('has exactly the expected key set — every key is a real GalaxyParams field', () => {
    expect(Object.keys(PARAM_SPEC).sort()).toEqual(EXPECTED_KEYS);
  });
});
