/**
 * Two guarantees the type system cannot express: re-adding a removed field
 * keeps its tuning, and a write against an unknown id is a no-op, not a throw.
 */
import { describe, it, expect } from 'vitest';

import {
  volumesSlice,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
} from '../../../../src/layers/volume/settings/volumesSlice';
import type { VolumeFieldId } from '../../../../src/@types/data/volume/VolumeFieldId';

// A seeded volume id (the boot value records every shippable volume).
const initial = volumesSlice.getInitialState();
const seededVolumeId = Object.keys(initial.items)[0] as VolumeFieldId;

describe('volumesSlice', () => {
  it('addVolumeField preserves an existing (tuned) row', () => {
    const tuned = volumesSlice.reducer(
      initial,
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.123 } }),
    );
    expect(tuned.items[seededVolumeId]?.intensity).toBe(0.123);

    // Re-registering the seeded id is an identity no-op — sliders survive.
    const readded = volumesSlice.reducer(tuned, addVolumeField(seededVolumeId));
    expect(readded.items[seededVolumeId]).toEqual(tuned.items[seededVolumeId]);
    expect(readded.items[seededVolumeId]?.intensity).toBe(0.123);
  });

  it('removeVolumeField deletes the row', () => {
    const next = volumesSlice.reducer(initial, removeVolumeField(seededVolumeId));
    expect(next.items[seededVolumeId]).toBeUndefined();
  });

  it('writeVolumeField patches a row; unknown id is a no-op', () => {
    const patched = volumesSlice.reducer(
      initial,
      writeVolumeField({ id: seededVolumeId, patch: { intensity: 0.77 } }),
    );
    expect(patched.items[seededVolumeId]?.intensity).toBe(0.77);

    const after = volumesSlice.reducer(
      initial,
      writeVolumeField({ id: 'no-such-volume' as VolumeFieldId, patch: { intensity: 1 } }),
    );
    expect(after.items).toEqual(initial.items);
  });
});
