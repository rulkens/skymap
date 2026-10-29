/**
 * satellitesAssetRows — the catalog loads near Earth or with the palette open, and also while a
 * satellite is selected or focused wherever the camera is: a deep link to one starts far from Earth
 * with the palette shut, and without the catalog its focus can never resolve.
 */

import { describe, it, expect } from 'vitest';

import { satellitesAssetRows } from '../../../../src/layers/satellites/load/satellitesAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { satellitesVisibility } from '../../../../src/layers/satellites/visibility';
import { fadeIdentitiesOf } from '../../../../src/utils/visibility/fadeIdentitiesOf';
import { fadeIdentityKey } from '../../../../src/utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../../src/utils/visibility/gateIdentityOf';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads only `selected` off the runtime; `slot` is carried, never called here.
const rowWith = (satelliteSelected: boolean) =>
  satellitesAssetRows({
    selected: { any: () => satelliteSelected, stop: () => {} },
  } as unknown as SatellitesRuntime)[0]!;

const FAR: DemandCtx = {
  settings: {
    satellites: {
      enabled: true,
      items: { active: { enabled: true }, debris: { enabled: true }, other: { enabled: true } },
    },
  } as unknown as Readonly<EngineSettingsState>,
  ui: { paletteOpen: false } as Readonly<UiState>,
  slotState: () => 'idle',
  // A whole parsec out: far past every satellite fade, with the palette shut.
  cameraPosMpc: [1e-6, 0, 0],
  simDays: CONST_J2000,
  tier: 'medium',
};

describe('satellitesAssetRows', () => {
  it('neither loads nor holds the catalog far from Earth with nothing asking for it', () => {
    const row = rowWith(false);
    expect(row.demand(FAR)).toBe(false);
    expect(row.release?.(FAR)).toBe(true);
  });

  it('loads and holds the catalog far from Earth while a satellite is selected', () => {
    const row = rowWith(true);
    expect(row.demand(FAR)).toBe(true);
    expect(row.release?.(FAR)).toBe(false);
  });

  // The fade registry throws on an identity it does not hold, and it throws from inside the
  // slot's first state change, so a stale gate silently stops the catalog from ever loading.
  it('gates only a fade identity the Layer declares', () => {
    const { gates } = rowWith(false);
    if (gates === undefined) return;
    const declared = satellitesVisibility.flatMap(fadeIdentitiesOf).map(fadeIdentityKey);
    expect(declared).toContain(fadeIdentityKey(gateIdentityOf(gates)));
  });
});
