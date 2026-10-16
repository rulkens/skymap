/**
 * Sgr A* is a black hole, not a body: it is named by its own caption rule.
 * A mis-routed caption item simply goes dark with an unrelated toggle, so
 * this pins the seam no compiler check covers.
 */

import { describe, it, expect } from 'vitest';

import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { SGR_A_STAR_ENTRY } from '../../../../src/layers/blackHoles/sources/sgrAStar';

describe('Sgr A*', () => {
  it('caption reads its own hole item, not the famous-star catalog item', () => {
    // The mis-wiring that riding the `star` caption kind produces: that row reads
    // the `famousStar` item, so the Galactic Centre's name would vanish with a
    // toggle that has nothing to do with it.
    expect(CAPTION_FADE_RULES.sgrAStar.fadeItem).toBe(SGR_A_STAR_ENTRY.id);
    expect(CAPTION_FADE_RULES.star.fadeItem).toBe('famousStar');
  });
});
