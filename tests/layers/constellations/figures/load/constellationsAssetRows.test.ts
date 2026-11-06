/**
 * constellationsAssetRows — the Layer's one demand predicate and factory,
 * exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { constellationsVisibility } from '../../../../../src/layers/constellations/visibility';

import { constellationsAssetRows } from '../../../../../src/layers/constellations/figures/load/constellationsAssetRows';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { ConstellationsRuntime } from '../../../../../src/layers/constellations/@types/ConstellationsRuntime';
import type { UiState } from '../../../../../src/@types/ui/UiState';

const RUNTIME = { slot: { __mockSlot: true } } as unknown as ConstellationsRuntime;
const ROW = constellationsAssetRows(RUNTIME)[0]!;

function makeCtx(settings: unknown): DemandCtx {
  return {
    settings: settings as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
    tier: 'medium',
    selectedKinds: new Set(),
  };
}

describe('constellationsAssetRows', () => {
  it('demand follows settings.constellations.enabled; switched off, it releases', () => {
    const at = (enabled: boolean) =>
      evaluateAssetDemand(ROW, makeCtx({ constellations: { enabled } }), constellationsVisibility);
    expect(at(true)).toEqual({ demand: true, release: false });
    expect(at(false)).toEqual({ demand: false, release: true });
  });
});
