/**
 * localBubbleAssetRows — the shell file's load and release distances, each just inside and
 * just outside its edge, and the release on switch-off.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { localBubbleVisibility } from '../../../../../src/layers/localBubble/visibility';

import { localBubbleAssetRows } from '../../../../../src/layers/localBubble/shell/load/localBubbleAssetRows';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
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
    drawPxPerRad: 0,
    tier: 'medium',
    selectedKinds: new Set(),
  };
}

const KPC = SCALE_UNITS.KPC_TO_MPC;
const at = (enabled: boolean, kpc: number) =>
  evaluateAssetDemand(ROW, makeCtx(enabled, kpc * KPC), localBubbleVisibility);

describe('localBubbleAssetRows', () => {
  it('loads inside 20 kpc', () => {
    expect(at(true, 19.9)).toEqual({ demand: true, release: false });
  });

  it('holds between 20 and 40 kpc', () => {
    expect(at(true, 30)).toEqual({ demand: false, release: false });
  });

  it('releases beyond 40 kpc', () => {
    expect(at(true, 40.1)).toEqual({ demand: false, release: true });
  });

  it('releases when switched off at Earth', () => {
    expect(at(false, 0)).toEqual({ demand: false, release: true });
  });
});
