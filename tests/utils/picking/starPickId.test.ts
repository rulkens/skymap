/**
 * starPickId — the two-table routing the whole star pick path rests on.
 *
 * A packed id is `(sourceCode << 26) | index`, and the index means nothing
 * without the code that says which table it indexes. So the invariant is not
 * "the index is right" but "the same index under two codes is two different
 * objects" — which is precisely what merging the tables would destroy.
 */

import { describe, it, expect } from 'vitest';
import { starPickId } from '../../../src/utils/picking/starPickId';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_S_STARS } from '../../../src/data/bodies/sceneSStars';
import { unpackPick } from '../../../src/data/selectionEncoding';
import { Source } from '../../../src/data/sources';

describe('starPickId', () => {
  it('stamps the source code of the table the star actually came from', () => {
    // The decode side (`BODY_PICK_ROWS`) picks its seed array from this
    // code. Stamping FamousStar for an S-star would resolve index 12 to whatever
    // famous star sits at 12 — a plausible, silently wrong body.
    const s2 = unpackPick(starPickId('s2')!)!;
    expect(s2.sourceCode).toBe(Source.SStar);
    expect(SCENE_S_STARS[s2.localIdx]?.id).toBe('s2');

    const sirius = unpackPick(starPickId('sirius')!)!;
    expect(sirius.sourceCode).toBe(Source.FamousStar);
    expect(SCENE_STARS[sirius.localIdx]?.id).toBe('sirius');
  });

  it('yields no id for a star in neither table', () => {
    // The −1 contract, hoisted: callers must SKIP rather than stamp, because
    // index −1 plus the sentinel offset packs to another body's id.
    expect(starPickId('krypton')).toBeNull();
  });
});
