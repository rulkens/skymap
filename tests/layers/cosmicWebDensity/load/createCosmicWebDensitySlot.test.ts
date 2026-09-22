/**
 * createCosmicWebDensitySlot — the arrival-ordering landmine: the upload must
 * land before the slot reports `ready`, or `installFadeOnArrival` misses the
 * guard's false→true edge and the cube never fades in.
 */
import { describe, it, expect, vi } from 'vitest';

import type { ScalarCube } from '../../../../src/@types/data/volume/ScalarCube';

const CUBE = {
  dims: [2, 2, 2],
  valueMin: 0,
  valueMax: 1,
} as unknown as ScalarCube;

vi.mock('../../../../src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher', () => ({
  cosmicWebDensityFetcher: vi.fn(async () => CUBE),
}));

import { createCosmicWebDensitySlot } from '../../../../src/layers/cosmicWebDensity/load/createCosmicWebDensitySlot';
import { POLYPHORM_2MRS_ENTRY } from '../../../../src/layers/cosmicWebDensity/sources/polyphorm-2mrs';
import type { VolumeFieldRenderer } from '../../../../src/@types/rendering/VolumeFieldRenderer';
import type { CosmicWebDensityFieldId } from '../../../../src/@types/data/volume/CosmicWebDensityFieldId';

describe('createCosmicWebDensitySlot', () => {
  it('uploads the cube with the row statics before the slot reports ready', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const upload = vi.fn();
    const renderer = { upload } as unknown as VolumeFieldRenderer<CosmicWebDensityFieldId>;
    const slot = createCosmicWebDensitySlot(POLYPHORM_2MRS_ENTRY, renderer);

    const uploadsAtReady: unknown[][] = [];
    slot.subscribe((s) => {
      if (s.kind === 'ready') uploadsAtReady.push(...upload.mock.calls);
    });
    await slot.load({ binBaseName: 'polyphorm-2mrs', tier: 'small' });

    expect(uploadsAtReady).toEqual([['polyphorm-2mrs', CUBE, POLYPHORM_2MRS_ENTRY]]);
  });
});
