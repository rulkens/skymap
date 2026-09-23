import { describe, it, expect } from 'vitest';
import { buildVolumeFieldSettings } from '../../../../src/layers/cosmicWebDensity/state/defaults';
import { MCPM_ENTRY } from '../../../../src/layers/cosmicWebDensity/sources/mcpm';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

describe('buildVolumeFieldSettings', () => {
  it('defaults bands to [surveyDeepZoom] for a source row with no fadeBands', () => {
    // MCPM's row (src/layers/cosmicWebDensity/sources/mcpm.ts) carries no `fadeBands`
    // override, so it must seed with today's one-size-fits-all band.
    expect(buildVolumeFieldSettings(MCPM_ENTRY).bands).toEqual([SCALE_FADE_BANDS.surveyDeepZoom]);
  });
});
