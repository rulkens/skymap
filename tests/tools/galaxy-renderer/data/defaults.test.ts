/**
 * Defaults spot-check against the spike's boot state
 * (`Galaxy Renderer.dc.html:472-477`) — these are the exact numbers a fresh
 * load of the spike rendered, so a drift here is a visible regression.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import { DEFAULT_RENDER_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultLodSettings';

describe('DEFAULT_GALAXY_PARAMS', () => {
  it('matches the spike boot state', () => {
    expect(DEFAULT_GALAXY_PARAMS.type).toBe('Sc');
    expect(DEFAULT_GALAXY_PARAMS.starCount).toBe(200000);
    expect(DEFAULT_GALAXY_PARAMS.seed).toBe(3);
    expect(DEFAULT_GALAXY_PARAMS.dustNoise).toBe(0.76);
  });
});

describe('DEFAULT_RENDER_SETTINGS', () => {
  it('carries the spike values', () => {
    expect(DEFAULT_RENDER_SETTINGS).toEqual({
      exposure: 0.92,
      bloom: 0.85,
      saturation: 1.26,
      vignette: 0.5,
      sizeScale: 0.3,
      starIntensity: 0.11,
      tonemap: 0,
    });
  });
});

describe('DEFAULT_LOD_SETTINGS', () => {
  it('carries the spike values', () => {
    expect(DEFAULT_LOD_SETTINGS).toEqual({
      lodApparent: 0.006,
      cullBright: 0,
    });
  });
});
