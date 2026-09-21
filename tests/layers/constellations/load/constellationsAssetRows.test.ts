/**
 * constellationsAssetRows — the Layer's one demand predicate and factory,
 * exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { constellationsAssetRows } from '../../../../src/layers/constellations/load/constellationsAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { ConstellationsRuntime } from '../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

const RUNTIME = { slot: { __mockSlot: true } } as unknown as ConstellationsRuntime;
const ROW = constellationsAssetRows(RUNTIME)[0]!;

function makeCtx(settings: unknown): DemandCtx {
  return {
    settings: settings as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('constellationsAssetRows', () => {
  it('demand follows settings.constellations.enabled', () => {
    expect(ROW.demand(makeCtx({ constellations: { enabled: true } }))).toBe(true);
    expect(ROW.demand(makeCtx({ constellations: { enabled: false } }))).toBe(false);
  });

  it('the factory hands back the runtime’s own slot, never minting one', () => {
    expect(ROW.factory({} as never)).toBe(RUNTIME.slot);
  });
});
