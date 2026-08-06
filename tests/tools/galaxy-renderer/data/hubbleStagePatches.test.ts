/**
 * hubbleTypePatch — port of the spike's onType handler
 * (`Galaxy Renderer.dc.html:519-533`). Category comes from
 * `classifyHubbleType`, so these cases exercise the patch values per
 * category/stage rather than re-testing the classifier itself.
 */
import { describe, expect, it } from 'vitest';
import { hubbleTypePatch } from '../../../../tools/galaxy-renderer/src/data/hubbleStagePatches';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

// The current params only matter as the base the picked type's nudges spread
// onto — every case below starts from an empty bag pair so the assertions
// see exactly the nudged fields, nothing carried over from a preset.
const CURRENT: GalaxyParams = { type: 'placeholder', shared: {}, legacy: {} };

describe('hubbleTypePatch', () => {
  it('every patch carries its own type', () => {
    for (const type of ['E3', 'S0', 'Irr', 'Sa', 'SBa', 'Sc']) {
      expect(hubbleTypePatch(CURRENT, type).type).toBe(type);
    }
  });

  it('Sa and SBa share the a-stage quintuple', () => {
    const expectedShared = { bulgeSize: 1.1, armWinding: 0.24, youngStars: 0.4 };
    const expectedLegacy = { armStrength: 0.9, hii: 0.7 };
    expect(hubbleTypePatch(CURRENT, 'Sa')).toEqual({
      type: 'Sa',
      shared: expectedShared,
      legacy: expectedLegacy,
    });
    expect(hubbleTypePatch(CURRENT, 'SBa')).toEqual({
      type: 'SBa',
      shared: expectedShared,
      legacy: expectedLegacy,
    });
  });

  it('Sc loosens arms vs Sa (armWinding 0.78 > 0.24)', () => {
    const a = hubbleTypePatch(CURRENT, 'Sa');
    const c = hubbleTypePatch(CURRENT, 'Sc');
    expect(c.shared?.armWinding).toBeGreaterThan(a.shared?.armWinding!);
    expect(c.shared?.armWinding).toBe(0.78);
    expect(a.shared?.armWinding).toBe(0.24);
  });
});
