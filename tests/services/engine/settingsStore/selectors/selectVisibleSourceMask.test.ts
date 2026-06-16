import { describe, it, expect } from 'vitest';

import { selectVisibleSourceMask } from '../../../../../src/services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { deriveSourceMasks } from '../../../../../src/services/engine/frame/deriveSourceMasks';
import { makeSettingsFixture } from '../makeSettingsFixture';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';

// Drive `deriveSourceMasks` against a minimal state stub so we can compare the
// selector against the engine's authoritative pick-mask packing. The selector
// must reproduce the EXACT `pick` bits for any enabled-set — it's the read seam
// that replaced the old `onMaskChange` echo (which sent the pick mask).
// `deriveSourceMasks` is pure: it RETURNS `{ draw, pick }`, so the stub is just
// its two inputs (settings + a fades opacity table), no `sources` slot.
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
    const settings = makeSettingsFixture(); // every galaxy catalog enabled
    const { pick } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pick);
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
    const { pick } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pick);
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
    // SDSS hidden but still fading out (opacity 0.5): the draw mask keeps the
    // bit, the pick mask drops it. The selector must match pick, not draw.
    const { draw, pick } = deriveMasks(settings, (id) => (id === 'sdss' ? 0.5 : 0));

    expect(selectVisibleSourceMask(settings)).toBe(pick);
    expect(selectVisibleSourceMask(settings)).not.toBe(draw);
  });
});
