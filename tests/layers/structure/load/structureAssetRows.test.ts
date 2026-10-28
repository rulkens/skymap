/**
 * structureAssetRows — the bulk catalog's demand predicate against a stub
 * `DemandCtx`: it loads when any bulk category has its ring
 * (`structures.items[cat].enabled`) OR its label (`.labelEnabled`) on.
 */

import { describe, it, expect } from 'vitest';

import { structureAssetRows } from '../../../../src/layers/structure/load/structureAssetRows';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { StructureRuntime } from '../../../../src/layers/structure/@types/StructureRuntime';
import type { UiState } from '../../../../src/@types/ui/UiState';

// The row reads no runtime field — only `factory` closes over the slot, and
// nothing here calls it.
const cluster = structureAssetRows({} as StructureRuntime)[0]!;

function makeCtx(over: { settings: unknown }): DemandCtx {
  return {
    settings: over.settings as Readonly<EngineSettingsState>,
    ui: { paletteOpen: false } as Readonly<UiState>,
    slotState: () => 'idle',
    cameraPosMpc: [Infinity, Infinity, Infinity],
    simDays: CONST_J2000,
    tier: 'medium',
  };
}

describe('structureAssetRows', () => {
  it('structureCatalog demand follows structure-category visibility (bug-fix pin)', () => {
    // Every category's ring + label off — both axes read from the item rows.
    const allHidden = {
      structures: {
        enabled: true,
        items: {
          'galaxy-cluster': { enabled: false, labelEnabled: false },
          supercluster: { enabled: false, labelEnabled: false },
          void: { enabled: false, labelEnabled: false },
          'galaxy-group': { enabled: false, labelEnabled: false },
        },
      },
    };
    expect(cluster.demand(makeCtx({ settings: allHidden }))).toBe(false);

    // Any single structure category visible in EITHER its ring or its label ⇒ true.
    expect(
      cluster.demand(
        makeCtx({
          settings: {
            structures: {
              enabled: true,
              items: {
                ...allHidden.structures.items,
                'galaxy-cluster': { enabled: true, labelEnabled: false },
              },
            },
          },
        }),
      ),
    ).toBe(true);
    expect(
      cluster.demand(
        makeCtx({
          settings: {
            structures: {
              enabled: true,
              items: {
                ...allHidden.structures.items,
                void: { enabled: false, labelEnabled: true },
              },
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
