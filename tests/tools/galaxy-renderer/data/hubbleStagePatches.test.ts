/**
 * hubbleTypePatch — port of the spike's onType handler
 * (`Galaxy Renderer.dc.html:519-533`). Category comes from
 * `classifyHubbleType`, so these cases exercise the patch values per
 * category/stage rather than re-testing the classifier itself.
 */
import { describe, expect, it } from 'vitest';
import { hubbleTypePatch } from '../../../../tools/galaxy-renderer/src/data/hubbleStagePatches';

describe('hubbleTypePatch', () => {
  it('every patch carries its own type', () => {
    for (const type of ['E3', 'S0', 'Irr', 'Sa', 'SBa', 'Sc']) {
      expect(hubbleTypePatch(type).type).toBe(type);
    }
  });

  it('Sa and SBa share the a-stage quintuple', () => {
    const expected = {
      bulgeSize: 1.1,
      armWinding: 0.24,
      armStrength: 0.9,
      hii: 0.7,
      youngStars: 0.4,
    };
    expect(hubbleTypePatch('Sa')).toEqual({ type: 'Sa', ...expected });
    expect(hubbleTypePatch('SBa')).toEqual({ type: 'SBa', ...expected });
  });

  it('Sc loosens arms vs Sa (armWinding 0.78 > 0.24)', () => {
    const a = hubbleTypePatch('Sa');
    const c = hubbleTypePatch('Sc');
    expect(c.armWinding).toBeGreaterThan(a.armWinding!);
    expect(c.armWinding).toBe(0.78);
    expect(a.armWinding).toBe(0.24);
  });
});
