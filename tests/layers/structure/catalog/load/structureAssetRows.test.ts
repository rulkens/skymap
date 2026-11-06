/**
 * structureAssetRows — the bulk catalog loads when any bulk category has its ring OR its
 * label on, and releases when every one is off. `galaxy-group` ships no `.ccat`, so it
 * alone must not fetch the catalog.
 */

import { describe, it, expect } from 'vitest';
import { evaluateAssetDemand } from '../../../../../src/services/engine/wiring/evaluateAssetDemand';
import { structureVisibility } from '../../../../../src/layers/structure/visibility';

import { structureAssetRows } from '../../../../../src/layers/structure/catalog/load/structureAssetRows';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { INITIAL_SETTINGS } from '../../../../../src/state/settings/initialSettings';
import type { DemandCtx } from '../../../../../src/@types/loading/DemandCtx';
import type { StructureId } from '../../../../../src/@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../../../src/@types/settings/StructureItemSettings';
import type { StructureRuntime } from '../../../../../src/layers/structure/@types/StructureRuntime';
import type { UiState } from '../../../../../src/@types/ui/UiState';

// The row reads no runtime field; `slot` is carried, never called here.
const ROW = structureAssetRows({} as StructureRuntime)[0]!;

const ALL_OFF = Object.fromEntries(
  Object.keys(INITIAL_SETTINGS.structures.items).map((id) => [
    id,
    { enabled: false, labelEnabled: false },
  ]),
) as Record<StructureId, StructureItemSettings>;

function demandWith(on: Partial<Record<StructureId, StructureItemSettings>>) {
  const ctx: DemandCtx = {
    settings: { ...INITIAL_SETTINGS, structures: { items: { ...ALL_OFF, ...on } } },
    ui: { paletteOpen: false } as UiState,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
    tier: 'medium',
    selectedKinds: new Set(),
  };
  return evaluateAssetDemand(ROW, ctx, structureVisibility);
}

describe('structureAssetRows', () => {
  it('every category off releases the catalog', () => {
    expect(demandWith({})).toEqual({ demand: false, release: true });
  });

  it('ring on demands the catalog', () => {
    expect(demandWith({ 'galaxy-cluster': { enabled: true, labelEnabled: false } })).toEqual({
      demand: true,
      release: false,
    });
  });

  it('label only on demands the catalog', () => {
    expect(demandWith({ void: { enabled: false, labelEnabled: true } })).toEqual({
      demand: true,
      release: false,
    });
  });

  it('galaxy-group alone does not demand', () => {
    expect(demandWith({ 'galaxy-group': { enabled: true, labelEnabled: true } })).toEqual({
      demand: false,
      release: true,
    });
  });
});
