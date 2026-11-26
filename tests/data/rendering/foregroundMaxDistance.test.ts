import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

import { walkFiles } from '../../helpers/conventions/walkFiles';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../src/data/rendering/foregroundMaxDistance';
import { FOREGROUND_FALLBACK_DISTANCE_MPC } from '../../../src/data/rendering/foregroundFallbackDistanceMpc';

// Bug caught: a pass or present helper comparing the eye to the cutoff by hand again, so it
// measures from somewhere other than its own region and outlives the band it should yield to.
describe('FOREGROUND_MAX_DISTANCE_MPC importers', () => {
  it('only band definitions import FOREGROUND_MAX_DISTANCE_MPC', () => {
    const importers = walkFiles('src', ['.ts', '.tsx'])
      .filter((file) =>
        /from\s+['"][^'"]*\/foregroundMaxDistance['"]/.test(readFileSync(file, 'utf8')),
      )
      .sort();
    expect(importers).toEqual([
      'src/data/bands/foregroundRecede.ts',
      'src/data/bands/surveyDeepZoom.ts',
      'src/layers/stellarStreams/visibility.ts',
      'src/layers/structure/visibility.ts',
    ]);
  });
});

describe('FOREGROUND_MAX_DISTANCE_MPC value', () => {
  // Bug caught: a margin or region change that cuts the star backdrop while the neighbourhood
  // is framed (low edge) or dims "You are here" in the Local Group (0.6 Mpc, `milkyWay/visibility.ts`).
  it('sits between the neighbourhood and the Milky Way label near edge with the app bodies', () => {
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeGreaterThan(0.2);
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeLessThan(0.6);
  });

  // Bug caught: the fallback (0.23) sits inside the range above, so without this the app value
  // could silently be the fallback.
  it('is derived from the app regions, not the fallback', () => {
    expect(Math.max(...BODY_REGIONS.map((region) => region.extentMpc))).toBeGreaterThan(0);
  });

  // Bug caught: a composition with no bodies zeroes every extent, inverting `SURVEY_DEEP_ZOOM`
  // so the survey fades out at every distance.
  it('falls back when no region has an extent, so the survey band stays upright', async () => {
    vi.resetModules();
    vi.doMock('../../../src/compositions/appBodies', () => ({ APP_BODY_REGISTRY: [] }));
    const { FOREGROUND_MAX_DISTANCE_MPC: empty } =
      await import('../../../src/data/rendering/foregroundMaxDistance');
    const { SURVEY_DEEP_ZOOM } = await import('../../../src/data/bands/surveyDeepZoom');

    expect(empty).toBe(FOREGROUND_FALLBACK_DISTANCE_MPC);
    expect(SURVEY_DEEP_ZOOM.in[0]).toBeLessThan(SURVEY_DEEP_ZOOM.in[1]);
  });

  afterEach(() => {
    vi.doUnmock('../../../src/compositions/appBodies');
    vi.resetModules();
  });
});
