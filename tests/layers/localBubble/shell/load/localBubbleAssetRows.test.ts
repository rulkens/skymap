/**
 * localBubbleAssetRows — the Layer's one demand/release predicate,
 * exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { localBubbleVisibility } from '../../../../../src/layers/localBubble/visibility';

import { localBubbleAssetRows } from '../../../../../src/layers/localBubble/shell/load/localBubbleAssetRows';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { LocalBubbleRuntime } from '../../../../../src/layers/localBubble/@types/LocalBubbleRuntime';
import type { UiState } from '../../../../../src/@types/ui/UiState';

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
    tier: 'medium',
    selectedKinds: new Set(),
  };
}

describe('localBubbleAssetRows', () => {
  it('demands only when enabled and within 20 kpc', () => {
    expect(evaluateAssetDemand(ROW, makeCtx(true, 0.01), localBubbleVisibility).demand).toBe(true);
    expect(evaluateAssetDemand(ROW, makeCtx(false, 0.01), localBubbleVisibility).demand).toBe(
      false,
    );
    expect(evaluateAssetDemand(ROW, makeCtx(true, 0.03), localBubbleVisibility).demand).toBe(false);
  });

  it('releases beyond 40 kpc, holds in between', () => {
    expect(evaluateAssetDemand(ROW, makeCtx(true, 0.03), localBubbleVisibility).release).toBe(
      false,
    );
    expect(evaluateAssetDemand(ROW, makeCtx(true, 0.05), localBubbleVisibility).release).toBe(true);
  });
});
