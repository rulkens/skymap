/**
 * filamentsAssetRows — the Layer's one demand predicate and request builder,
 * exercised against a stub `DemandCtx` without a full engine.
 */

import { describe, it, expect } from 'vitest';

import { filamentsAssetRows } from '../../../../src/layers/cosmicWebFilaments/load/filamentsAssetRows';
import { sameRequest } from '../../../../src/utils/loading/sameRequest';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { CosmicWebFilamentsRuntime } from '../../../../src/layers/cosmicWebFilaments/@types/CosmicWebFilamentsRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads neither the renderer nor the slot — only `factory` closes over
// the runtime, and nothing here calls it.
const ROW = filamentsAssetRows({} as CosmicWebFilamentsRuntime)[0]!;

function makeCtx(settings: unknown): DemandCtx {
  return {
    settings: settings as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
  };
}

describe('filamentsAssetRows', () => {
  it('demand follows settings.filaments.enabled (bug-fix pin)', () => {
    expect(ROW.demand(makeCtx({ filaments: { enabled: true } }))).toBe(true);
    expect(ROW.demand(makeCtx({ filaments: { enabled: false } }))).toBe(false);
  });

  it('the request drifts only across the small boundary', () => {
    // Polarity, not just drift: a flipped flag would fetch the wrong file at
    // every tier while keeping the drift assertions below green.
    expect(ROW.req('small')).toEqual({ small: true });
    expect(ROW.req('large')).toEqual({ small: false });
    expect(sameRequest(ROW.req('medium'), ROW.req('large'))).toBe(true);
    expect(sameRequest(ROW.req('small'), ROW.req('medium'))).toBe(false);
  });
});
