import type { VolumeStore } from '../../../@types/engine/data/VolumeStore';
import type { VolumeFieldId } from '../../../@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

/**
 * createVolumeStore — factory for the (thin) volume data store.
 *
 * Same factory + closure shape as the other stores. Holds only the
 * registered field ids + their params; the voxel cubes stay on the GPU
 * renderer. `registered()` snapshots the current key set so callers can
 * iterate without holding a live map reference.
 */
export function createVolumeStore(): VolumeStore {
  const fields = new Map<VolumeFieldId, VolumeFieldSettings>();

  return Object.freeze({
    get fields(): ReadonlyMap<VolumeFieldId, VolumeFieldSettings> {
      return fields;
    },
    registered(): readonly VolumeFieldId[] {
      return [...fields.keys()];
    },
    params(id: VolumeFieldId): VolumeFieldSettings | undefined {
      return fields.get(id);
    },
    setParams(id: VolumeFieldId, params: VolumeFieldSettings): void {
      fields.set(id, params);
    },
  });
}
