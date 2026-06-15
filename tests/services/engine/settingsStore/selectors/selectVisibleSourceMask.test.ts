import { describe, it, expect } from 'vitest';

import { selectVisibleSourceMask } from '../../../../../src/services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { deriveSourceMasks } from '../../../../../src/services/engine/frame/deriveSourceMasks';
import { makeSettingsFixture } from '../makeSettingsFixture';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../../src/@types/engine/data/GalaxyCatalogId';

// Drive `deriveSourceMasks` against a minimal state stub so we can compare the
// selector against the engine's authoritative pick-mask packing. The selector
// must reproduce the EXACT `pickMask` bits for any enabled-set — it's the read
// seam that replaced the old `onMaskChange` echo (which sent `pickMask`).
function deriveMasks(
  settings: EngineSettingsState,
  opacityFor: (id: GalaxyCatalogId) => number = () => 0,
): { drawMask: number; pickMask: number } {
  const state = {
    settings,
    sources: { drawMask: 0, pickMask: 0 },
    subsystems: {
      fades: { opacityOf: (h: { id: GalaxyCatalogId }) => opacityFor(h.id) },
    },
  };
  deriveSourceMasks(state as never);
  return { drawMask: state.sources.drawMask, pickMask: state.sources.pickMask };
}

describe('selectVisibleSourceMask', () => {
  it('packs the enabled bits to the deriveSourceMasks pick bitmask (all enabled)', () => {
    const settings = makeSettingsFixture(); // every galaxy catalog enabled
    const { pickMask } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
  });

  it('packs the enabled bits to the deriveSourceMasks pick bitmask (one disabled)', () => {
    const base = makeSettingsFixture();
    const settings = makeSettingsFixture({
      galaxyCatalogs: {
        ...base.galaxyCatalogs,
        items: {
          ...base.galaxyCatalogs.items,
          sdss: { ...base.galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    const { pickMask } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
  });

  it('follows intent only — a disabled galaxy catalog still fading out is not in the mask', () => {
    const base = makeSettingsFixture();
    const settings = makeSettingsFixture({
      galaxyCatalogs: {
        ...base.galaxyCatalogs,
        items: {
          ...base.galaxyCatalogs.items,
          sdss: { ...base.galaxyCatalogs.items.sdss, enabled: false },
        },
      },
    });
    // SDSS hidden but still fading out (opacity 0.5): drawMask keeps the bit,
    // pickMask drops it. The selector must match pickMask, not drawMask.
    const { drawMask, pickMask } = deriveMasks(settings, (id) => (id === 'sdss' ? 0.5 : 0));

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
    expect(selectVisibleSourceMask(settings)).not.toBe(drawMask);
  });
});
