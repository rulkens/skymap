import { describe, it, expect } from 'vitest';

import {
  selectSettings,
  selectTier,
  selectGalaxyCatalogSize,
  selectBrightness,
  selectDepthFade,
  selectHighlightFallback,
  selectRealOnly,
  selectGalaxyCatalogItems,
  selectExposure,
  selectToneMapCurve,
  selectAutoRotate,
  selectBiasMode,
  selectAbsMagLimit,
  selectThumbnailsEnabled,
  selectMilkyWayEnabled,
  selectMilkyWayLabelEnabled,
  selectFilamentsEnabled,
  selectFilamentIntensity,
  selectVolumesEnabled,
  selectVolumeFieldItems,
  selectFlow,
  selectShowPickBuffer,
  selectShowDiskRadiusRing,
  selectDisabledPasses,
  selectStructureItems,
  selectVisibleSourceMask,
} from '../../../src/state/settings/selectors';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { settingsRoute } from '../../../src/store/constants';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';
import { deriveSourceMasks } from '../../../src/services/engine/frame/deriveSourceMasks';
import type { RootState } from '../../../src/store/types';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

// Every test builds a RootState by mounting a fresh boot-settings literal at the
// settings route, optionally patched. The selectors are RootState-scoped, so
// they read through `state[settingsRoute]` exactly as the React/engine sides do.
function makeRoot(patch?: Partial<EngineSettingsState>): RootState {
  const settings = { ...buildInitialSettings({ initialTier: 'medium' }), ...patch };
  return { [settingsRoute]: settings } as RootState;
}

// Drive `deriveSourceMasks` against a minimal state stub so the mask selector
// can be compared against the engine's authoritative pick-mask packing. The
// selector must reproduce the EXACT `pick` bits for any enabled-set — it's the
// read seam that replaced the old `onMaskChange` echo (which sent the pick
// mask). `deriveSourceMasks` is pure: it RETURNS `{ draw, pick }`, so the stub
// is just its two inputs (settings + a fades opacity table), no `sources` slot.
function deriveMasks(
  settings: EngineSettingsState,
  opacityFor: (id: GalaxyCatalogId) => number = () => 0,
): { draw: number; pick: number } {
  const state = {
    settings,
    subsystems: {
      fades: { opacityOf: (h: { id: GalaxyCatalogId }) => opacityFor(h.id) },
    },
  };
  return deriveSourceMasks(state as never);
}

describe('selectSettings', () => {
  it('lifts the settings slice out of RootState by reference', () => {
    const state = makeRoot();

    expect(selectSettings(state)).toBe(state[settingsRoute]);
  });
});

describe('tier', () => {
  it('selectTier reads tier', () => {
    const state = makeRoot({ tier: 'large' });

    expect(selectTier(state)).toBe('large');
  });
});

describe('galaxyCatalogs cluster', () => {
  it('selectGalaxyCatalogSize reads galaxyCatalogs.sizePx', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: { ...base[settingsRoute].galaxyCatalogs, sizePx: 6 },
    });

    expect(selectGalaxyCatalogSize(state)).toBe(6);
  });

  it('selectBrightness reads galaxyCatalogs.brightness', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: { ...base[settingsRoute].galaxyCatalogs, brightness: 3.25 },
    });

    expect(selectBrightness(state)).toBe(3.25);
  });

  it('selectDepthFade reads galaxyCatalogs.depthFade', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: { ...base[settingsRoute].galaxyCatalogs, depthFade: false },
    });

    expect(selectDepthFade(state)).toBe(false);
  });

  it('selectHighlightFallback reads galaxyCatalogs.highlightFallback', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: { ...base[settingsRoute].galaxyCatalogs, highlightFallback: true },
    });

    expect(selectHighlightFallback(state)).toBe(true);
  });

  it('selectRealOnly reads galaxyCatalogs.realOnly', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: { ...base[settingsRoute].galaxyCatalogs, realOnly: true },
    });

    expect(selectRealOnly(state)).toBe(true);
  });

  it('selectGalaxyCatalogItems returns the raw items Record by reference', () => {
    const state = makeRoot();

    expect(selectGalaxyCatalogItems(state)).toBe(state[settingsRoute].galaxyCatalogs.items);
  });
});

describe('tonemap cluster', () => {
  it('selectExposure reads tonemap.exposure', () => {
    const base = makeRoot();
    const state = makeRoot({
      tonemap: { ...base[settingsRoute].tonemap, exposure: 5.25 },
    });

    expect(selectExposure(state)).toBe(5.25);
  });

  it('selectToneMapCurve reads tonemap.curve', () => {
    const base = makeRoot();
    const state = makeRoot({
      tonemap: { ...base[settingsRoute].tonemap, curve: ToneMapCurve.Asinh },
    });

    expect(selectToneMapCurve(state)).toBe(ToneMapCurve.Asinh);
  });
});

describe('camera cluster', () => {
  it('selectAutoRotate reads camera.autoRotate', () => {
    const base = makeRoot();
    const state = makeRoot({
      camera: { ...base[settingsRoute].camera, autoRotate: true },
    });

    expect(selectAutoRotate(state)).toBe(true);
  });
});

describe('bias cluster', () => {
  it('selectBiasMode reads bias.mode', () => {
    const base = makeRoot();
    const state = makeRoot({
      bias: { ...base[settingsRoute].bias, mode: 2 },
    });

    expect(selectBiasMode(state)).toBe(2);
  });

  it('selectAbsMagLimit reads bias.absMagLimit', () => {
    const base = makeRoot();
    const state = makeRoot({
      bias: { ...base[settingsRoute].bias, absMagLimit: -21 },
    });

    expect(selectAbsMagLimit(state)).toBe(-21);
  });
});

describe('thumbnails cluster', () => {
  it('selectThumbnailsEnabled reads thumbnails.enabled', () => {
    const base = makeRoot();
    const state = makeRoot({
      thumbnails: { ...base[settingsRoute].thumbnails, enabled: false },
    });

    expect(selectThumbnailsEnabled(state)).toBe(false);
  });
});

describe('milkyWay cluster', () => {
  it('selectMilkyWayEnabled reads milkyWay.enabled', () => {
    const base = makeRoot();
    const state = makeRoot({
      milkyWay: { ...base[settingsRoute].milkyWay, enabled: false },
    });

    expect(selectMilkyWayEnabled(state)).toBe(false);
  });

  it('selectMilkyWayLabelEnabled reads milkyWay.labelEnabled', () => {
    const base = makeRoot();
    const state = makeRoot({
      milkyWay: { ...base[settingsRoute].milkyWay, labelEnabled: false },
    });

    expect(selectMilkyWayLabelEnabled(state)).toBe(false);
  });
});

describe('filaments cluster', () => {
  it('selectFilamentsEnabled reads filaments.enabled', () => {
    const base = makeRoot();
    const state = makeRoot({
      filaments: { ...base[settingsRoute].filaments, enabled: false },
    });

    expect(selectFilamentsEnabled(state)).toBe(false);
  });

  it('selectFilamentIntensity reads filaments.intensity', () => {
    const base = makeRoot();
    const state = makeRoot({
      filaments: { ...base[settingsRoute].filaments, intensity: 0.42 },
    });

    expect(selectFilamentIntensity(state)).toBe(0.42);
  });
});

describe('volumes cluster', () => {
  it('selectVolumesEnabled reads volumes.enabled', () => {
    const base = makeRoot();
    const on = makeRoot({ volumes: { ...base[settingsRoute].volumes, enabled: true } });
    const off = makeRoot({ volumes: { ...base[settingsRoute].volumes, enabled: false } });

    expect(selectVolumesEnabled(on)).toBe(true);
    expect(selectVolumesEnabled(off)).toBe(false);
  });

  it('selectVolumeFieldItems returns the raw items Record by reference', () => {
    const state = makeRoot();

    expect(selectVolumeFieldItems(state)).toBe(state[settingsRoute].volumes.items);
  });
});

describe('flow cluster', () => {
  it('selectFlow returns the flow object by reference', () => {
    const state = makeRoot();

    expect(selectFlow(state)).toBe(state[settingsRoute].flow);
  });
});

describe('debug cluster', () => {
  it('selectShowPickBuffer reads debug.showPickBuffer', () => {
    const base = makeRoot();
    const state = makeRoot({
      debug: { ...base[settingsRoute].debug, showPickBuffer: true },
    });

    expect(selectShowPickBuffer(state)).toBe(true);
  });

  it('selectShowDiskRadiusRing reads debug.showDiskRadiusRing', () => {
    const base = makeRoot();
    const state = makeRoot({
      debug: { ...base[settingsRoute].debug, showDiskRadiusRing: true },
    });

    expect(selectShowDiskRadiusRing(state)).toBe(true);
  });

  it('selectDisabledPasses returns the debug record (Record<string, boolean>, not a Set)', () => {
    const base = makeRoot();
    const state = makeRoot({
      debug: { ...base[settingsRoute].debug, disabledPasses: { 'point-sprites': true } },
    });

    expect(selectDisabledPasses(state)).toEqual({ 'point-sprites': true });
  });
});

describe('structures cluster', () => {
  it('selectStructureItems returns the raw items Record by reference', () => {
    const state = makeRoot();

    expect(selectStructureItems(state)).toBe(state[settingsRoute].structures.items);
  });
});

describe('selectVisibleSourceMask', () => {
  it('packs the enabled bits to the deriveSourceMasks pick bitmask (all enabled)', () => {
    const state = makeRoot(); // every galaxy catalog enabled
    const { pick } = deriveMasks(state[settingsRoute]);

    expect(selectVisibleSourceMask(state)).toBe(pick);
  });

  it('packs the enabled bits to the deriveSourceMasks pick bitmask (one disabled)', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: {
        ...base[settingsRoute].galaxyCatalogs,
        items: {
          ...base[settingsRoute].galaxyCatalogs.items,
          sdss: { ...base[settingsRoute].galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    const { pick } = deriveMasks(state[settingsRoute]);

    expect(selectVisibleSourceMask(state)).toBe(pick);
  });

  it('follows intent only — a disabled galaxy catalog still fading out is not in the mask', () => {
    const base = makeRoot();
    const state = makeRoot({
      galaxyCatalogs: {
        ...base[settingsRoute].galaxyCatalogs,
        items: {
          ...base[settingsRoute].galaxyCatalogs.items,
          sdss: { ...base[settingsRoute].galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    // SDSS hidden but still fading out (opacity 0.5): the draw mask keeps the
    // bit, the pick mask drops it. The selector must match pick, not draw.
    const { draw, pick } = deriveMasks(state[settingsRoute], (id) => (id === 'sdss' ? 0.5 : 0));

    expect(selectVisibleSourceMask(state)).toBe(pick);
    expect(selectVisibleSourceMask(state)).not.toBe(draw);
  });

  it('memoizes on the settings reference (same state → same call result)', () => {
    const state = makeRoot();

    expect(selectVisibleSourceMask(state)).toBe(selectVisibleSourceMask(state));
  });
});
