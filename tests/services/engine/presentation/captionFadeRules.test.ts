/**
 * captionFadeRules — the Sgr A* caption's approach band.
 *
 * Sgr A* is 8 kpc away and DRAWS NOTHING, so its row is the one body caption
 * that must not take Earth's and the planets' bandless form (`NO_BAND`, a
 * constant 1). Bandless, the name and its leader line hang permanently over
 * empty space in the solar-system view — and the rows look interchangeable, so
 * a later "simplification" to match its neighbours is the live hazard.
 *
 * The property pinned is the fade's behaviour at each end — 0 from the solar
 * system, full alpha at the Galactic Centre — never the band's authored edges,
 * which are a taste knob and free to be re-tuned.
 */

import { describe, it, expect } from 'vitest';

import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { SGR_A_STAR_ANCHOR } from '../../../../src/data/bodies/sceneSgrAStar';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { regionById } from '../../../../src/utils/scene/regionById';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';

describe('the Sgr A* caption fades in on approach', () => {
  it('is silent from the solar system', () => {
    // The camera at the Sun, naming something 8 kpc away. The solar system's
    // own span is seven decades smaller than that distance, so no vantage
    // inside it can lift the target off the floor.
    const fromTheSun = distanceMpc(RENDER_ORIGIN_MPC, SGR_A_STAR_ANCHOR.positionMpc);
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(fromTheSun)).toBe(0);
  });

  it('reaches full alpha on arrival at the Galactic Centre', () => {
    // Parked as near Sgr A* as Neptune is to the Sun — arrived, by any framing
    // of the region.
    const arrivedMpc = regionById('solar-system').extentMpc;
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(arrivedMpc)).toBe(1);
  });
});
