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

  // paramsPatched Object.assigns whole bags (this file's own header doc), so
  // a patch naming only the nudged fields would ERASE every other field the
  // user already had set in `shared`/`legacy`. CURRENT above is always an
  // empty bag pair, so that erasure risk has never been exercised — a
  // non-empty CURRENT is the only way to catch a stage branch that forgets
  // its own `{ ...shared, ... }`/`{ ...legacy, ... }` spread.
  it('carries UNRELATED existing shared/legacy fields through a spiral-stage patch untouched', () => {
    const current: GalaxyParams = {
      type: 'placeholder',
      shared: { armCount: 4, bulgeSize: 99 },
      legacy: { spriteDust: 0.42, armStrength: 99 },
    };
    const patch = hubbleTypePatch(current, 'Sb');

    // Untouched fields carry through unchanged.
    expect(patch.shared?.armCount).toBe(4);
    expect(patch.legacy?.spriteDust).toBe(0.42);
    // Fields the stage-b nudge DOES own take the nudge, not CURRENT's value.
    expect(patch.shared?.bulgeSize).toBe(0.7);
    expect(patch.legacy?.armStrength).toBe(1.1);
  });

  it('a lenticular patch (S0, legacy-only) carries legacy fields through and leaves shared untouched', () => {
    const current: GalaxyParams = {
      type: 'placeholder',
      shared: { armCount: 4 },
      legacy: { spriteDust: 0.9, armStrength: 99 },
    };
    const patch = hubbleTypePatch(current, 'S0');

    expect(patch.shared).toBeUndefined();
    expect(patch.legacy?.armStrength).toBe(99); // untouched, carried through
    expect(patch.legacy?.spriteDust).toBe(0.15); // lenticular's own nudge
  });
});
