/**
 * RESOLVE_PICK — the star arm. resolvePick.test.ts covers galaxy / structure /
 * milkyWay / non-pickable dispatch; this mirror pins the newly-added
 * `starCatalog` arm end-to-end: a Gaia-star pick must route through
 * SOURCE_REGISTRY[GaiaStars].type === 'starCatalog' to a positional star ref.
 * That wiring (registry type ↔ table key) is exactly what a real bug could
 * break, and no other test exercises it.
 */

import { describe, it, expect } from 'vitest';

import { resolvePick } from '../../../../src/services/engine/helpers/resolvePick';
import { Source } from '../../../../src/data/sources';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import type { ResolvePickDeps } from '../../../../src/@types/engine/ResolvePickDeps';

/** The star arm reads no store data, so a stub structure store suffices. */
const deps: ResolvePickDeps = { structures: { byCategory: () => [] } };

describe('RESOLVE_PICK starCatalog arm', () => {
  it('maps a Gaia-star pick to a positional star ref', () => {
    expect(resolvePick({ sourceCode: Source.GaiaStars, localIdx: 42 }, deps)).toEqual({
      type: 'star',
      index: 42,
    });
  });
});

// The body arms decode a pick's localIdx (the seed index the drawPick stamped,
// sentinel already subtracted) back into the SAME durable seed array the pack
// side indexed. A wrong array / off-by-one here names the wrong body — exactly
// the failure `seedIndexOfBody`'s stability contract exists to prevent, checked
// from the decode side.
describe('RESOLVE_PICK body arms', () => {
  it('recovers the famousStar seed id from its pick index', () => {
    const idx = SCENE_STARS.length - 1;
    expect(resolvePick({ sourceCode: Source.FamousStar, localIdx: idx }, deps)).toEqual({
      type: 'body',
      id: SCENE_STARS[idx]!.id,
    });
  });

  it('recovers the planet seed id from its pick index', () => {
    const idx = SCENE_PLANETS.length - 1;
    expect(resolvePick({ sourceCode: Source.Planet, localIdx: idx }, deps)).toEqual({
      type: 'body',
      id: SCENE_PLANETS[idx]!.id,
    });
  });

  it('recovers Earth from its sole pick index (0)', () => {
    expect(resolvePick({ sourceCode: Source.Earth, localIdx: 0 }, deps)).toEqual({
      type: 'body',
      id: SCENE_EARTH.id,
    });
  });

  it('returns null for an out-of-range body pick index', () => {
    expect(
      resolvePick({ sourceCode: Source.FamousStar, localIdx: SCENE_STARS.length }, deps),
    ).toBeNull();
    expect(
      resolvePick({ sourceCode: Source.Planet, localIdx: SCENE_PLANETS.length }, deps),
    ).toBeNull();
    expect(resolvePick({ sourceCode: Source.Earth, localIdx: 1 }, deps)).toBeNull();
  });
});
