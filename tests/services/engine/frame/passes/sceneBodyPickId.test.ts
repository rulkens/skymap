/**
 * sceneBodyPickId is the caption half of an identity the body layers stamp
 * from four different seed tables. The invariant is the routing: a packed id
 * carries an index that means nothing without the source code naming the table
 * it indexes, so stamping the right index under the wrong code resolves to a
 * plausible, silently wrong body — the same failure `starPickId`'s own test
 * pins for its two star tables.
 */

import { describe, expect, it } from 'vitest';
import { sceneBodyPickId } from '../../../../../src/services/engine/frame/passes/sceneBodyPickId';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../../src/data/bodies/scenePlanets';
import { SCENE_STARS } from '../../../../../src/data/bodies/sceneStars';
import { SGR_A_STAR } from '../../../../../src/data/bodies/sceneSgrAStar';
import { unpackPick } from '../../../../../src/data/selectionEncoding';
import { Source } from '../../../../../src/data/sources';

describe('sceneBodyPickId', () => {
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

    // The Sun rides the star table, not a Sun-specific code — its caption must
    // decode the same way its dot does.
    const sun = unpackPick(sceneBodyPickId('sun')!)!;
    expect(sun.sourceCode).toBe(Source.FamousStar);
    expect(SCENE_STARS[sun.localIdx]?.id).toBe('sun');
  });

  it('yields no id for an unseeded body', () => {
    // The −1 contract: callers must SKIP rather than stamp, because an index
    // packed from −1 aliases body 0.
    expect(sceneBodyPickId('krypton')).toBeNull();
  });
});
