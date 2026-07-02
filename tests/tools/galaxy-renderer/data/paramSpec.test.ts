/**
 * PARAM_SPEC — verbatim port of the spike's SPEC table
 * (`Galaxy Renderer.dc.html:450-461`). Every row must be a valid range
 * (min < max, positive step) and every key must be a real `GalaxyParams`
 * field — a typo here would silently produce a dead slider.
 */
import { describe, expect, it } from 'vitest';
import { PARAM_SPEC } from '../../../../tools/galaxy-renderer/src/data/paramSpec';

// The exact key set the spike's SPEC table declares, spot-checked by hand
// against `Galaxy Renderer.dc.html:450-461`. A mismatch here (extra or
// missing key) means the port drifted from the source.
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
].sort();

describe('PARAM_SPEC', () => {
  it('every entry has min < max and positive step', () => {
    for (const [key, entry] of Object.entries(PARAM_SPEC)) {
      expect(entry!.min, `${key}.min`).toBeLessThan(entry!.max);
      expect(entry!.step, `${key}.step`).toBeGreaterThan(0);
    }
  });

  it('spot-checks three rows verbatim', () => {
    expect(PARAM_SPEC.radius).toEqual({ min: 0.4, max: 1.8, step: 0.05 });
    expect(PARAM_SPEC.dust).toEqual({ min: 0, max: 0.7, step: 0.05 });
    expect(PARAM_SPEC.warpTwist).toEqual({ min: 0, max: 6.28, step: 0.05 });
  });

  it('has exactly the SPEC table key set — every key is a real GalaxyParams field', () => {
    expect(Object.keys(PARAM_SPEC).sort()).toEqual(EXPECTED_KEYS);
  });
});
