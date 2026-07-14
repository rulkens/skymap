import { describe, it, expect } from 'vitest';
import { FAMOUS_STAR_GAIA_IDS } from '../../../tools/catalog/famousStarGaiaIds';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';

describe('FAMOUS_STAR_GAIA_IDS', () => {
  // Structural invariant, not a constant restatement: the dedup key must cover
  // exactly the scene's stars. A star seeded in SCENE_STARS with no row here
  // would double-render (scene body + Gaia point); an orphan row keys nothing.
  // This catches that curation drift the moment SCENE_STARS gains or drops a star.
  it('covers every SCENE_STARS id — no missing, no extra keys', () => {
    const sceneIds = new Set(SCENE_STARS.map((s) => s.id));
    const tableKeys = new Set(Object.keys(FAMOUS_STAR_GAIA_IDS));
    expect(tableKeys).toEqual(sceneIds);
  });

  // Pinned branch: the Sun has no Gaia row, so the dedup must find nothing to
  // subtract for it rather than reaching for an id that doesn't exist.
  it('maps the Sun to null', () => {
    expect(FAMOUS_STAR_GAIA_IDS['sun']).toBe(null);
  });
});
