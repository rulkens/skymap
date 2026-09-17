/**
 * flowAssetRows — the Layer's one demand predicate, exercised against a stub
 * `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { flowAssetRows } from '../../../../src/layers/flow/load/flowAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { FlowRuntime } from '../../../../src/layers/flow/types/FlowRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads neither the renderer nor the slot — only `factory` closes over
// the runtime, and nothing here calls it.
const ROW = flowAssetRows({} as FlowRuntime)[0]!;

function makeCtx(settings: unknown): DemandCtx {
  return {
    settings: settings as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('flowAssetRows', () => {
  it('demand follows settings.flow.enabled', () => {
    expect(ROW.demand(makeCtx({ flow: { enabled: true } }))).toBe(true);
    expect(ROW.demand(makeCtx({ flow: { enabled: false } }))).toBe(false);
  });
});
