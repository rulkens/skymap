/**
 * Sgr A* is a black hole, not a body: it is positioned by its place, named by
 * its own caption rule, and reached through `blackhole-` links. Every failure
 * of that split is silent — a surviving body path still resolves, a mis-routed
 * caption gate simply goes dark with an unrelated toggle — so these pin the
 * seams no compiler check covers.
 */

import { describe, it, expect } from 'vitest';

import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { GALACTIC_CENTRE_ANCHOR } from '../../../../src/data/places/galacticCentre';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { selectionResolverOver } from '../../../support/selectionResolverOver';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

import type { CaptionFadeRule } from '../../../../src/services/engine/presentation/captionFadeRules';

const ID = 'sgr-a-star';
const STATES = deriveBodyStates(CONST_J2000);

const resolver = selectionResolverOver({
  structures: { byId: () => null, byCategory: () => [] },
});

describe('Sgr A*', () => {
  it('is no longer a body: absent from the body table and the old deep link', () => {
    expect(SCENE_BODIES.map((body) => body.id)).not.toContain(ID);
    expect(resolver.resolveFocusId(`body-${ID}`)).toBeNull();
  });

  it('its place sits at the catalogue RA/Dec/distance', () => {
    // The published radio position and the GRAVITY 2019 distance are the
    // external oracle; the assertion round-trips the Cartesian anchor back to
    // them rather than re-running the conversion, so a swapped axis or a
    // degrees/radians slip cannot survive it.
    const [x, y, z] = STATES.get(GALACTIC_CENTRE_ANCHOR.id)!.positionMpc;
    const rMpc = Math.hypot(x, y, z);

    expect(rMpc / SCALE_UNITS.PC_TO_MPC).toBeCloseTo(8178, 6);
    expect(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toBeCloseTo(266.41684, 9);
    expect((Math.asin(z / rMpc) * 180) / Math.PI).toBeCloseTo(-29.00781, 9);
  });

  it('caption follows its own label toggle and survives muting the famous-star catalog', () => {
    // The mis-wiring that riding the `star` caption kind produces: that row's
    // gates read `starCatalogs.items.famousStar`, so the Galactic Centre's name
    // would vanish with a toggle that has nothing to do with it.
    const settings = makeSettingsFixture();
    settings.starCatalogs.enabled = false;
    settings.starCatalogs.items.famousStar.enabled = false;
    settings.starCatalogs.items.famousStar.labelEnabled = false;

    const sgrARule: CaptionFadeRule = CAPTION_FADE_RULES.sgrAStar;
    expect(sgrARule.labelEnabled(settings) && sgrARule.subjectVisible(settings)).toBe(true);

    const starRule: CaptionFadeRule = CAPTION_FADE_RULES.star;
    expect(starRule.labelEnabled(settings) && starRule.subjectVisible(settings)).toBe(false);

    const muted = makeSettingsFixture({
      blackHoles: { items: { [ID]: { labelEnabled: false } } },
    });
    expect(sgrARule.labelEnabled(muted)).toBe(false);
  });
});
