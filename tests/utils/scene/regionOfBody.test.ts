import { describe, it, expect } from 'vitest';
import { regionOfBody } from '../../../src/utils/scene/regionOfBody';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';

describe('regionOfBody', () => {
  it('every scene body belongs to exactly one region', () => {
    // Totality is what lets the palette chip replace its `'Solar System'`
    // literal with a lookup instead of adding a fallback beside it: a body in no
    // region yields a silently undefined chip. Disjointness is asserted on the
    // member lists directly, since `regionOfBody` returns the first claim and
    // would hide a second one.
    for (const body of SCENE_BODIES) {
      const claiming = BODY_REGIONS.filter((region) => region.memberIds.includes(body.id));
      expect(
        claiming.map((region) => region.id),
        `regions claiming '${body.id}'`,
      ).toHaveLength(1);
      expect(regionOfBody(body.id), `region for '${body.id}'`).not.toBeNull();
    }
  });

  it('the Sun belongs to the solar system, not to the neighbourhood it anchors', () => {
    // The placement an implementer gets backwards: the Sun ANCHORS the
    // neighbourhood's distances, but the regime it sits in is the solar system,
    // so its chip must read "Solar System". Extents are unaffected either way —
    // the Sun contributes 0 to the region it is in — so nothing else here fails
    // when it is filed under the neighbourhood instead.
    expect(regionOfBody('sun')?.id).toBe('solar-system');

    const neighbourhood = BODY_REGIONS.find((region) => region.id === 'solar-neighbourhood');
    expect(neighbourhood?.anchorId).toBe('sun');
    expect(neighbourhood?.memberIds).not.toContain('sun');
  });
});
