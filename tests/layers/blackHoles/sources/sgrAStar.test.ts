/**
 * Sgr A* is a black hole, not a body: it is named by its own caption rule.
 * A mis-routed caption gate simply goes dark with an unrelated toggle, so
 * this pins the seam no compiler check covers.
 */

import { describe, it, expect } from 'vitest';

import { CAPTION_FADE_RULES } from '../../../../src/services/engine/presentation/captionFadeRules';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

import type { CaptionFadeRule } from '../../../../src/services/engine/presentation/captionFadeRules';

const ID = 'sgr-a-star';

describe('Sgr A*', () => {
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
