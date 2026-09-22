/**
 * cosmicWebDensityFadeRows — the arrival edge over the Layer's REAL slots and
 * rows: a committed cube opens its own field fade once, and no other.
 */
import { describe, it, expect, vi } from 'vitest';

import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';

vi.mock('../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher', () => ({
  cosmicWebDensityFetcher: vi.fn(async () => ({ dims: [2, 2, 2], valueMin: 0, valueMax: 1 })),
}));

import { cosmicWebDensityFadeRows } from '../../../../src/layers/cosmicWebDensity/present/cosmicWebDensityFadeRows';
import { createCosmicWebDensitySlot } from '../../../../src/layers/cosmicWebDensity/load/createCosmicWebDensitySlot';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../../../../src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows';
import { installFadeOnArrival } from '../../../../src/services/engine/wiring/installFadeOnArrival';
import { makeFadeBridgeState } from '../../../helpers/engine/makeFadeBridgeState';

import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { AssetSlot } from '../../../../src/@types/loading/AssetSlot';
import type { CosmicWebDensityFieldId } from '../../../../src/@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldRenderer } from '../../../../src/@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityRuntime } from '../../../../src/layers/cosmicWebDensity/@types/CosmicWebDensityRuntime';
import type { FadeBridgeState } from '../../../helpers/engine/FadeBridgeState';

describe('cosmicWebDensityFadeRows', () => {
  it('opens the field fade exactly once when its slot commits', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { state, fadeTo, settings } = makeFadeBridgeState();
    (settings.cosmicWebDensity.items.mcpm as { enabled: boolean }).enabled = true;

    const resident = new Set<CosmicWebDensityFieldId>();
    const renderer = {
      upload: (id: CosmicWebDensityFieldId, _cube: ScalarCube) => resident.add(id),
      listIds: () => [...resident],
    } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
    const slots = new Map<string, AssetSlot<unknown, unknown>>(
      COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => [
        entry.id,
        createCosmicWebDensitySlot(entry, renderer) as AssetSlot<unknown, unknown>,
      ]),
    );
    (state as FadeBridgeState).fadeRows = cosmicWebDensityFadeRows({
      renderer,
    } as unknown as CosmicWebDensityRuntime) as FadeBridgeState['fadeRows'];

    installFadeOnArrival(state as EngineState, slots);
    await slots.get('mcpm')!.load({ binBaseName: 'mcpm', tier: 'small' });

    const fieldFades = fadeTo.mock.calls
      .map(([id]) => id)
      .filter((id) => id.kind === 'cosmicWebDensityField');
    expect(fieldFades).toEqual([{ kind: 'cosmicWebDensityField', id: 'mcpm' }]);
  });
});
