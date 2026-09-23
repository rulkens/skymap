/**
 * cosmicWebDensityAssetRows — each row's demand reads its OWN cube's enabled
 * flag, exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { cosmicWebDensityAssetRows } from '../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows';
import { Source } from '../../../../src/data/sources';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { INITIAL_SETTINGS } from '../../../../src/state/settings/initialSettings';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// Only `factory` closes over the runtime, and nothing here calls it.
const ROWS = cosmicWebDensityAssetRows({} as CosmicWebDensityRuntime);

function makeCtx(polyphormEnabled: boolean, mcpmEnabled: boolean): DemandCtx {
  const items = {
    ...INITIAL_SETTINGS.cosmicWebDensity.items,
    'polyphorm-2mrs': {
      ...INITIAL_SETTINGS.cosmicWebDensity.items['polyphorm-2mrs'],
      enabled: polyphormEnabled,
    },
    mcpm: { ...INITIAL_SETTINGS.cosmicWebDensity.items.mcpm, enabled: mcpmEnabled },
  };
  return {
    settings: {
      cosmicWebDensity: { ...INITIAL_SETTINGS.cosmicWebDensity, items },
    } as unknown as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('cosmicWebDensityAssetRows', () => {
  it('polyphorm-2mrs demand follows its own field-enabled flag', () => {
    const polyphorm = ROWS.find((row) => row.key === Source.Polyphorm2MRS)!;
    expect(polyphorm.demand(makeCtx(true, false))).toBe(true);
    expect(polyphorm.demand(makeCtx(false, true))).toBe(false);
  });
});
