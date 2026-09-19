/**
 * localBubbleAssetRows — the Layer's one demand/release predicate,
 * exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { localBubbleAssetRows } from '../../../../src/layers/localBubble/load/localBubbleAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { LocalBubbleRuntime } from '../../../../src/layers/localBubble/types/LocalBubbleRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads neither the renderer nor the slot — only `factory` closes
// over the runtime, and nothing here calls it.
const ROW = localBubbleAssetRows({} as LocalBubbleRuntime)[0]!;

function makeCtx(enabled: boolean, distanceMpc: number): DemandCtx {
  return {
    settings: {
      localBubble: { enabled, intensity: 1 },
    } as unknown as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [distanceMpc, 0, 0],
    simDays: CONST_J2000,
  };
}

describe('localBubbleAssetRows', () => {
  it('demands only when enabled and within 20 kpc', () => {
    expect(ROW.demand(makeCtx(true, 0.01))).toBe(true);
    expect(ROW.demand(makeCtx(false, 0.01))).toBe(false);
    expect(ROW.demand(makeCtx(true, 0.03))).toBe(false);
  });

  it('releases beyond 40 kpc, holds in between', () => {
    expect(ROW.release!(makeCtx(true, 0.03))).toBe(false);
    expect(ROW.release!(makeCtx(true, 0.05))).toBe(true);
  });
});
