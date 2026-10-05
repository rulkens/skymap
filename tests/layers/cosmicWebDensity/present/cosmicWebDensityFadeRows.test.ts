/**
 * cosmicWebDensityFadeRows — the arrival edge over the Layer's REAL slots and
 * rows: a committed cube opens its own field fade once, and no other. Also
 * covers the arrival-ordering landmine: the upload must land with the row's
 * statics before the slot reports `ready`, or `installFadeOnArrival` misses
 * the guard's false→true edge and the cube never fades in.
 */
import { describe, it, expect, vi } from 'vitest';

import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';

const CUBE = { dims: [2, 2, 2], valueMin: 0, valueMax: 1 } as unknown as ScalarCube;

vi.mock('../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher', () => ({
  cosmicWebDensityFetcher: vi.fn(async () => CUBE),
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
  it('opens the field fade exactly once when its slot commits, after the upload lands', async () => {
    const { state, fadeTo, settings } = makeFadeBridgeState();
    (settings.cosmicWebDensity.items.mcpm as { enabled: boolean }).enabled = true;

    const resident = new Set<CosmicWebDensityFieldId>();
    const upload = vi.fn((id: CosmicWebDensityFieldId) => resident.add(id));
    const renderer = {
      upload,
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
    const mcpmEntry = COSMIC_WEB_DENSITY_SOURCE_ROWS.find(([, e]) => e.id === 'mcpm')![1];
    await slots.get('mcpm')!.load({ binBaseName: 'mcpm', tier: 'small' });

    expect(upload.mock.calls).toEqual([['mcpm', CUBE, mcpmEntry]]);

    const fieldFades = fadeTo.mock.calls
      .map(([id]) => id)
      .filter((id) => id.kind === 'cosmicWebDensityField');
    expect(fieldFades).toEqual([{ kind: 'cosmicWebDensityField', id: 'mcpm' }]);
  });
});
