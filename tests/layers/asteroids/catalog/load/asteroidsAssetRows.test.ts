/**
 * asteroidsAssetRows — the catalog loads only while shown and near the Sun, or while the palette
 * or an asteroid selection lifts it.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { asteroidsAssetRows } from '../../../../../src/layers/asteroids/catalog/load/asteroidsAssetRows';
import { asteroidsVisibility } from '../../../../../src/layers/asteroids/visibility';
import { ASTEROID_FADES } from '../../../../../src/layers/asteroids/points/data/asteroidFades';
import { initialState } from '../../../../../src/layers/asteroids/state/asteroids/initialState';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { AsteroidsRuntime } from '../../../../../src/layers/asteroids/@types/AsteroidsRuntime';
import type { UiState } from '../../../../../src/@types/ui/UiState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Slots are carried, never called here.
const [CATALOG] = asteroidsAssetRows({} as AsteroidsRuntime);

const auFromSun = (au: number): Vec3 => [au * SCALE_UNITS.AU_TO_MPC, 0, 0];
const INSIDE = auFromSun(ASTEROID_FADES.fullWithinAu);
const FAR = auFromSun(ASTEROID_FADES.goneBeyondAu * 10);

const LOAD = { demand: true, release: false };
const RELEASE = { demand: false, release: true };

function verdict(
  row: typeof CATALOG,
  cameraPosMpc: Vec3,
  { enabled = true, paletteOpen = false, selected = false } = {},
) {
  const ctx: DemandCtx = {
    settings: {
      asteroids: { ...initialState, enabled },
    } as unknown as Readonly<EngineSettingsState>,
    ui: { paletteOpen } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc,
    simDays: CONST_J2000,
    drawPxPerRad: 0,
    tier: 'medium',
    selectedKinds: new Set(selected ? ['asteroid'] : []),
  };
  return evaluateAssetDemand(row!, ctx, asteroidsVisibility);
}

describe('asteroidsAssetRows', () => {
  it('the asset row demands only while shown and inside the band, or while searching', () => {
    expect(verdict(CATALOG, INSIDE)).toEqual(LOAD);
    expect(verdict(CATALOG, FAR)).toEqual(RELEASE);
    expect(verdict(CATALOG, INSIDE, { enabled: false })).toEqual(RELEASE);
    expect(verdict(CATALOG, FAR, { paletteOpen: true })).toEqual(LOAD);
    expect(verdict(CATALOG, FAR, { selected: true })).toEqual(LOAD);
  });
});
