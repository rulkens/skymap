/**
 * satellitesAssetRows — the catalog loads near Earth or with the palette open, and also for a
 * selected or focused satellite wherever the camera is: a deep link to one starts far from Earth
 * with the palette shut, and without the catalog its focus can never resolve.
 */

import { describe, it, expect } from 'vitest';

import { satellitesAssetRows } from '../../../../src/layers/satellites/load/satellitesAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { NO_SELECTION } from '../../../support/noSelection';
import { satellitesVisibility } from '../../../../src/layers/satellites/visibility';
import { fadeIdentitiesOf } from '../../../../src/utils/visibility/fadeIdentitiesOf';
import { fadeIdentityKey } from '../../../../src/utils/visibility/fadeIdentityKey';
import { gateIdentityOf } from '../../../../src/utils/visibility/gateIdentityOf';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { SatellitesRuntime } from '../../../../src/layers/satellites/@types/SatellitesRuntime';
import type { SelectionState } from '../../../../src/@types/store/SelectionState';
import type { SelectionRef } from '../../../../src/@types/engine/SelectionRef';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads no runtime field; only `factory` closes over the slot, and nothing here calls it.
const row = satellitesAssetRows({} as SatellitesRuntime)[0]!;

const ISS: SelectionRef = { type: 'satellite', noradId: 25544 };
const EARTH: SelectionRef = { type: 'body', id: SCENE_EARTH.id };

function farCtx(selection: Partial<SelectionState>): DemandCtx {
  return {
    settings: {
      satellites: {
        enabled: true,
        items: { active: { enabled: true }, debris: { enabled: true }, other: { enabled: true } },
      },
    } as unknown as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    selection: { ...NO_SELECTION, ...selection },
    slotState: () => 'idle',
    // A whole parsec out: far past every satellite fade, with the palette shut.
    cameraPosMpc: [1e-6, 0, 0],
    simDays: CONST_J2000,
    tier: 'medium',
  };
}

describe('satellitesAssetRows', () => {
  it('neither loads nor holds the catalog far from Earth with nothing asking for it', () => {
    expect(row.demand(farCtx({}))).toBe(false);
    expect(row.release?.(farCtx({}))).toBe(true);
    expect(row.release?.(farCtx({ focus: EARTH }))).toBe(true);
  });

  it.each([
    ['focused', { focus: ISS }],
    ['selected', { select: ISS }],
  ] as const)('loads and holds the catalog for a %s satellite far from Earth', (_label, sel) => {
    expect(row.demand(farCtx(sel))).toBe(true);
    expect(row.release?.(farCtx(sel))).toBe(false);
  });

  // The fade registry throws on an identity it does not hold, and it throws from inside the
  // slot's first state change, so a stale gate silently stops the catalog from ever loading.
  it('gates only a fade identity the Layer declares', () => {
    if (row.gates === undefined) return;
    const declared = satellitesVisibility.flatMap(fadeIdentitiesOf).map(fadeIdentityKey);
    expect(declared).toContain(fadeIdentityKey(gateIdentityOf(row.gates)));
  });
});
