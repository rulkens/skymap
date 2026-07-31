/**
 * Sgr A* is the scene's first body that is registered, positioned, named and
 * selectable while drawing NOTHING. Every failure mode of that combination is
 * silent — an unregistered body is simply not found, an unemitted caption is
 * simply not there, a mis-routed caption gate simply goes dark with an
 * unrelated toggle — so the three tests here pin the seams that have no
 * compiler check behind them.
 */

import { describe, it, expect } from 'vitest';

import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { ORBITAL_ELEMENTS } from '../../../src/data/bodies/orbitalElements';
import { SGR_A_STAR } from '../../../src/data/bodies/sceneSgrAStar';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { sceneBodyLabels } from '../../../src/services/engine/presentation/sceneBodyLabels';
import { CAPTION_FADE_RULES } from '../../../src/services/engine/presentation/captionFadeRules';
import { resolveFocusId } from '../../../src/services/url/resolveFocusId';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { makeSettingsFixture } from '../../state/settings/makeSettingsFixture';

import type { CaptionFadeRule } from '../../../src/services/engine/presentation/captionFadeRules';
import type { ResolveDeps } from '../../../src/@types/engine/ResolveDeps';

const ID = 'sgr-a-star';
const STATES = deriveBodyStates(CONST_J2000);

// The body decoder resolves against the static SCENE_BODIES import and reads
// nothing off the live engine resources, so there is no catalog to stub.
const NO_DEPS = {} as ResolveDeps;

describe('Sgr A*', () => {
  it('is focusable and labelled but contributes no draw record', () => {
    // Focusable + selectable: both consumers gate on SCENE_BODIES membership and
    // return null on a miss, so the decode standing in for them is the check.
    expect(resolveFocusId(`body-${ID}`, NO_DEPS)).toEqual({ type: 'body', id: ID });

    // Labelled: with no geometry the caption is the ENTIRE on-screen presence,
    // so an unemitted one leaves nothing at all — and no error.
    const captions = sceneBodyLabels(STATES);
    expect(captions.map((caption) => caption.text)).toContain(SGR_A_STAR.label);

    // No draw record: the content layers address these three seed tables and the
    // element table. Sgr A* must be in none of them, or "draws nothing" is false.
    expect(SCENE_STARS.map((star) => star.id)).not.toContain(ID);
    expect(SCENE_PLANETS.map((planet) => planet.id)).not.toContain(ID);
    expect(SCENE_EARTH.id).not.toBe(ID);
    expect(ORBITAL_ELEMENTS.map((element) => element.id)).not.toContain(ID);
  });

  it('position matches its catalogue RA/Dec/distance', () => {
    // The published radio position and the GRAVITY 2019 distance are the
    // external oracle; the assertion round-trips the Cartesian anchor back to
    // them rather than re-running the conversion, so a swapped axis or a
    // degrees/radians slip in the seed cannot survive it.
    const [x, y, z] = STATES.get(ID)!.positionMpc;
    const rMpc = Math.hypot(x, y, z);

    expect(rMpc / SCALE_UNITS.PC_TO_MPC).toBeCloseTo(8178, 6);
    expect(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toBeCloseTo(266.41684, 9);
    expect((Math.asin(z / rMpc) * 180) / Math.PI).toBeCloseTo(-29.00781, 9);
  });

  it('caption survives muting the famous-star catalog', () => {
    // The mis-wiring that riding the `star` caption kind produces: that row's
    // gates read `starCatalogs.items.famousStar`, so Sgr A*'s name would vanish
    // with a toggle that has nothing to do with it. Asserted against the star
    // row in the same breath, so the test fails rather than passes vacuously if
    // the two kinds are ever collapsed.
    const settings = makeSettingsFixture();
    settings.starCatalogs.enabled = false;
    settings.starCatalogs.items.famousStar.enabled = false;
    settings.starCatalogs.items.famousStar.labelEnabled = false;

    const sgrARule: CaptionFadeRule = CAPTION_FADE_RULES.sgrAStar;
    expect(sgrARule.labelEnabled(settings) && sgrARule.subjectVisible(settings)).toBe(true);

    const starRule: CaptionFadeRule = CAPTION_FADE_RULES.star;
    expect(starRule.labelEnabled(settings) && starRule.subjectVisible(settings)).toBe(false);
  });
});
