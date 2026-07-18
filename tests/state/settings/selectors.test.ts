import { describe, it, expect } from 'vitest';

import { selectVisibleSourceMask } from '../../../src/state/settings/selectors';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { settingsRoute } from '../../../src/store/constants';
import { deriveSourceMasks } from '../../../src/services/engine/frame/deriveSourceMasks';
import type { RootState } from '../../../src/store/types';
import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

// Every test builds a RootState by mounting a fresh boot-settings literal at the
// settings route, optionally patched. The selectors are RootState-scoped, so
// they read through `state[settingsRoute]` exactly as the React/engine sides do.
function makeRoot(patch?: Partial<EngineSettingsState>): RootState {
  const settings = { ...buildInitialSettings(), ...patch };
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
