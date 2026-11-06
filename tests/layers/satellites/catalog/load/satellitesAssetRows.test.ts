/**
 * satellitesAssetRows — the catalog's load and release distances, measured from Earth where the
 * clock has carried it (never the origin), and the palette and selection lifts: a deep link to a
 * satellite starts far from Earth with the palette shut, and without the catalog its focus can
 * never resolve.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { satellitesAssetRows } from '../../../../../src/layers/satellites/catalog/load/satellitesAssetRows';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../../src/data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { satellitesVisibility } from '../../../../../src/layers/satellites/visibility';
import { fadeIdentitiesOf } from '../../../../../src/utils/visibility/fadeIdentitiesOf';
import { fadeIdentityKey } from '../../../../../src/utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../../../src/utils/visibility/gateIdentityOf';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../../src/@types/settings/EngineSettingsState';
import type { SatellitesRuntime } from '../../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { UiState } from '../../../../../src/@types/ui/UiState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// `slot` is carried, never called here.
const ROW = satellitesAssetRows({} as SatellitesRuntime)[0]!;

// A third of a year past J2000, so Earth sits an au from the origin in a direction of its own.
const SIM_DAYS = CONST_J2000 + 120;
const EARTH = deriveBodyStates(SIM_DAYS).get(SCENE_EARTH.id)!.positionMpc;
const kmFromEarth = (km: number): Vec3 => [
  EARTH[0] + km * SCALE_UNITS.KM_TO_MPC,
  EARTH[1],
  EARTH[2],
];
// A whole parsec out: far past every satellite edge.
const FAR: Vec3 = [1e-6, 0, 0];

const LOAD = { demand: true, release: false };
const HOLD = { demand: false, release: false };
const RELEASE = { demand: false, release: true };

function verdict(
  cameraPosMpc: Vec3,
  { classesOn = true, paletteOpen = false, selected = false } = {},
) {
  const ctx: DemandCtx = {
    settings: {
      satellites: {
        enabled: true,
        items: {
          active: { enabled: classesOn },
          debris: { enabled: classesOn },
          other: { enabled: classesOn },
        },
      },
    } as unknown as Readonly<EngineSettingsState>,
    ui: { paletteOpen } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc,
    simDays: SIM_DAYS,
    tier: 'medium',
    selectedKinds: new Set(selected ? ['satellite'] : []),
  };
  return evaluateAssetDemand(ROW, ctx, satellitesVisibility);
}

describe('satellitesAssetRows', () => {
  it('loads within 900,000 km of Earth', () => {
    // Measured from the origin this eye is an au out: only an Earth-relative band loads it.
    expect(Math.hypot(...kmFromEarth(899_000))).toBeGreaterThan(1e6 * SCALE_UNITS.KM_TO_MPC);
    expect(verdict(kmFromEarth(899_000))).toEqual(LOAD);
  });

  it('holds at 1,200,000 km', () => {
    expect(verdict(kmFromEarth(1_200_000))).toEqual(HOLD);
  });

  it('releases beyond 1,500,000 km', () => {
    expect(verdict(kmFromEarth(1_501_000))).toEqual(RELEASE);
  });

  it('palette open loads from anywhere and never releases', () => {
    expect(verdict(FAR, { paletteOpen: true })).toEqual(LOAD);
  });

  it('a selected satellite loads from anywhere and never releases', () => {
    expect(verdict(FAR, { selected: true })).toEqual(LOAD);
  });

  it('every class off releases even with the palette open', () => {
    expect(verdict(kmFromEarth(0), { classesOn: false, paletteOpen: true })).toEqual(RELEASE);
  });

  // The fade registry throws on an identity it does not hold, and it throws from inside the
  // slot's first state change, so a stale gate silently stops the catalog from ever loading.
  it('gates only a fade identity the Layer declares', () => {
    const { gates } = ROW;
    if (gates === undefined) return;
    const declared = satellitesVisibility.flatMap(fadeIdentitiesOf).map(fadeIdentityKey);
    expect(declared).toContain(fadeIdentityKey(gateIdentityOf(gates)));
  });
});
