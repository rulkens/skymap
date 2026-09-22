/**
 * A guarantee the type system cannot express: a write against an unknown id
 * is a no-op, not a throw.
 */
import { describe, it, expect } from 'vitest';

import {
  cosmicWebDensitySlice,
  writeCosmicWebDensityField,
} from '../../../../../src/layers/cosmicWebDensity/state/cosmicWebDensity/slice';
import type { CosmicWebDensityFieldId } from '../../../../../src/@types/data/volume/CosmicWebDensityFieldId';

// A seeded volume id (the boot value records every shippable volume).
const initial = cosmicWebDensitySlice.getInitialState();
const seededVolumeId = Object.keys(initial.items)[0] as CosmicWebDensityFieldId;

describe('volumesSlice', () => {
  it('writeVolumeField patches a row; unknown id is a no-op', () => {
    const patched = cosmicWebDensitySlice.reducer(
      initial,
      writeCosmicWebDensityField({ id: seededVolumeId, patch: { intensity: 0.77 } }),
    );
    expect(patched.items[seededVolumeId]?.intensity).toBe(0.77);

    const after = cosmicWebDensitySlice.reducer(
      initial,
      writeCosmicWebDensityField({
        id: 'no-such-volume' as CosmicWebDensityFieldId,
        patch: { intensity: 1 },
      }),
    );
    expect(after.items).toEqual(initial.items);
  });
});
