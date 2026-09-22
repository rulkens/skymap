/**
 * sceneBodyPickId is the caption half of an identity the body layers stamp
 * from four different seed tables. The invariant is the routing: a packed id
 * carries an index that means nothing without the source code naming the table
 * it indexes, so stamping the right index under the wrong code resolves to a
 * plausible, silently wrong body.
 */

import { describe, expect, it } from 'vitest';
import { sceneBodyPickId } from '../../../src/utils/picking/sceneBodyPickId';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import { unpackPick } from '../../../src/data/selectionEncoding';
import { Source } from '../../../src/data/sources';

const resolver = selectionResolverOver({
  structures: { byId: () => null, byCategory: () => [] },
});

describe('sceneBodyPickId', () => {
  // Not subsumed by the round-trip test below: a consistent row swap (e.g. earth
  // ↔ sgr-a-star in BODY_PICK_ROWS) round-trips cleanly while diverging from the
  // GPU stamp — only these sourceCode assertions catch that.
  it('routes each seeded body to the table its own geometry pick indexes', () => {
    const earth = unpackPick(sceneBodyPickId(SCENE_EARTH.id)!)!;
    expect(earth.sourceCode).toBe(Source.Earth);
    expect(earth.localIdx).toBe(0);

    const sgr = unpackPick(sceneBodyPickId(SGR_A_STAR.id)!)!;
    expect(sgr.sourceCode).toBe(Source.SgrAStar);
    expect(sgr.localIdx).toBe(0);

    const planet = unpackPick(sceneBodyPickId('moon')!)!;
    expect(planet.sourceCode).toBe(Source.Planet);
    expect(SCENE_PLANETS[planet.localIdx]?.id).toBe('moon');
  });

  it('yields no id for a star — a star caption packs its own source and seed index', () => {
    expect(sceneBodyPickId('sun')).toBeNull();
    expect(sceneBodyPickId('sirius')).toBeNull();
    expect(sceneBodyPickId('s2')).toBeNull();
  });

  it('yields no id for an unseeded body', () => {
    // The −1 contract: callers must SKIP rather than stamp, because an index
    // packed from −1 aliases body 0.
    expect(sceneBodyPickId('krypton')).toBeNull();
  });

  it('a packed caption id resolves back to the body it was packed for', () => {
    // One id per BODY_PICK_ROWS row: this is the test that fails the day pack
    // and unpack read different tables.
    for (const id of [SCENE_EARTH.id, 'moon', SGR_A_STAR.id, 'phobos']) {
      expect(resolver.resolvePick(unpackPick(sceneBodyPickId(id)!))).toEqual({
        type: 'body',
        id,
      });
    }
  });
});
