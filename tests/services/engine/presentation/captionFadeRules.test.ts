/**
 * captionFadeRules — the Galactic Centre caption's reach.
 *
 * Its row is the one body caption that must not take Earth's and the planets'
 * `SOLAR_SYSTEM_REACH` form: the thing it names is 8 kpc away, and the view that
 * most needs the name is the one framing the whole galaxy — beyond where that
 * step cuts. The rows look interchangeable, so a later "simplification" to match
 * its neighbours is the live hazard, and it would be invisible in the solar
 * system where the two agree.
 *
 * The property pinned is the fade's behaviour at each end — readable from Earth,
 * silent once the galaxy is one object among many — never the band's authored
 * edges, which are a taste knob and free to be re-tuned.
 */

import { describe, it, expect } from 'vitest';

import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { SGR_A_STAR_ANCHOR } from '../../../../src/data/bodies/sceneSgrAStar';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { regionById } from '../../../../src/utils/scene/regionById';
import { distanceMpc } from '../../../../src/utils/math/distanceMpc';

const R0_MPC = distanceMpc(RENDER_ORIGIN_MPC, SGR_A_STAR_ANCHOR.positionMpc);

describe('the Galactic Centre caption reaches past the solar system', () => {
  it('is readable from Earth and on arrival alike', () => {
    // From the Sun the anchor is R₀ away; parked as near it as Neptune is to the
    // Sun, it is arrived. Both ends of the descent read full alpha — the name is
    // an orientation landmark for the whole approach, not a proximity reward.
    const arrivedMpc = regionById('solar-system').extentMpc;
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(R0_MPC, R0_MPC)).toBe(1);
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(arrivedMpc, arrivedMpc)).toBe(1);
  });

  it('outlives the solar system caption range that bounds its neighbours', () => {
    // A vantage past the range Earth's and the planets' captions are cut at, and
    // past R₀ — where the galaxy frames up. Those two must be silent here and
    // this one must not: the whole reason the reach became per-kind.
    const beyondMpc = SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC * 1.5;
    expect(beyondMpc).toBeGreaterThan(R0_MPC);
    expect(CAPTION_FADE_RULES.earth.fadeTarget(beyondMpc, beyondMpc)).toBe(0);
    expect(CAPTION_FADE_RULES.planet.fadeTarget(beyondMpc, beyondMpc)).toBe(0);
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(beyondMpc, beyondMpc)).toBeGreaterThan(0);
  });

  it('goes silent once the galaxy is one object among many', () => {
    // Past the far edge — a disc diameter out — the name has dissolved. Without
    // this the row would be bandless in all but name, hanging a permanent label
    // (and a leader line to empty space) at every zoom out to the Local Group.
    const farMpc = MILKY_WAY_RADIUS_MPC * 4;
    expect(CAPTION_FADE_RULES.sgrAStar.fadeTarget(farMpc, farMpc)).toBe(0);
  });

  it('keeps the solar-system kinds on inside their range', () => {
    // The other half of the reach split: moving the bound out of the layer gate
    // into these rows must not have narrowed them.
    const insideMpc = SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC / 2;
    expect(CAPTION_FADE_RULES.earth.fadeTarget(insideMpc, insideMpc)).toBe(1);
    expect(CAPTION_FADE_RULES.planet.fadeTarget(insideMpc, insideMpc)).toBe(1);
  });
});
