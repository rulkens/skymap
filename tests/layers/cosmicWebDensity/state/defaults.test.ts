import { describe, it, expect } from 'vitest';
import { buildVolumeFieldSettings } from '../../../../src/layers/cosmicWebDensity/state/defaults';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';

describe('volumeFieldDefaults', () => {
  it('buildVolumeFieldSettings defaults bands to [surveyDeepZoom] for a registry entry with no fadeBands', () => {
    // MCPM's registry row (src/layers/cosmicWebDensity/sources/mcpm.ts) carries no `fadeBands`
    // override, so it must seed with today's one-size-fits-all band.
    expect(buildVolumeFieldSettings('mcpm').bands).toEqual([SCALE_FADE_BANDS.surveyDeepZoom]);
  });
});
