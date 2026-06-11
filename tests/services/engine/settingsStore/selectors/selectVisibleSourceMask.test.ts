import { describe, it, expect } from 'vitest';

import { selectVisibleSourceMask } from '../../../../../src/services/engine/settingsStore/selectors/selectVisibleSourceMask';
import { deriveSourceMasks } from '../../../../../src/services/engine/frame/deriveSourceMasks';
import { Source } from '../../../../../src/data/sources';
import { makeSettingsFixture } from '../makeSettingsFixture';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';

// Drive `deriveSourceMasks` against a minimal state stub so we can compare the
// selector against the engine's authoritative pick-mask packing. The selector
// must reproduce the EXACT `pickMask` bits for any enabled-set — it's the read
// seam that replaced the old `onMaskChange` echo (which sent `pickMask`).
function deriveMasks(
  settings: EngineSettingsState,
  opacityFor: (source: number) => number = () => 0,
): { drawMask: number; pickMask: number } {
  const state = {
    settings,
    sources: { drawMask: 0, pickMask: 0 },
    subsystems: {
      fades: { opacityOf: (h: { source: number }) => opacityFor(h.source) },
    },
  };
  deriveSourceMasks(state as never);
  return { drawMask: state.sources.drawMask, pickMask: state.sources.pickMask };
}

describe('selectVisibleSourceMask', () => {
  it('packs the enabled bits to the deriveSourceMasks pick bitmask (all enabled)', () => {
    const settings = makeSettingsFixture(); // every survey enabled
    const { pickMask } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
  });

  it('packs the enabled bits to the deriveSourceMasks pick bitmask (one disabled)', () => {
    const base = makeSettingsFixture();
    const settings = makeSettingsFixture({
      surveys: {
        ...base.surveys,
        items: { ...base.surveys.items, sdss: { ...base.surveys.items.sdss, enabled: false } },
      },
    });
    const { pickMask } = deriveMasks(settings);

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
  });

  it('follows intent only — a disabled survey still fading out is not in the mask', () => {
    const base = makeSettingsFixture();
    const settings = makeSettingsFixture({
      surveys: {
        ...base.surveys,
        items: { ...base.surveys.items, sdss: { ...base.surveys.items.sdss, enabled: false } },
      },
    });
    // SDSS hidden but still fading out (opacity 0.5): drawMask keeps the bit,
    // pickMask drops it. The selector must match pickMask, not drawMask.
    const { drawMask, pickMask } = deriveMasks(settings, (source) =>
      source === Source.SDSS ? 0.5 : 0,
    );

    expect(selectVisibleSourceMask(settings)).toBe(pickMask);
    expect(selectVisibleSourceMask(settings)).not.toBe(drawMask);
  });
});
