import type { VolumeFieldId } from '../../data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../settings/VolumeFieldSettings';

/**
 * VolumeStore — thin store tracking which scalar-volume fields are
 * registered and their per-field params.
 *
 * "Thin" because the heavy payload — the voxel cubes + LUT textures —
 * lives on `scalarVolumeRenderer` (GPU-resident, never CPU-queried). The
 * store holds only what the CPU reads: the set of registered field ids and
 * their `VolumeFieldSettings` (enabled / intensity / contrast / palette /
 * …). This absorbs the pre-store `state.settings.volumes.fields` record so
 * volume params have a per-type home alongside the other data stores.
 *
 * The param shape keeps its existing `VolumeFieldSettings` name: it is the
 * same data the SettingsPanel reads, just homed on the data store rather
 * than the settings bag.
 */
export type VolumeStore = {
  /** Per-field params, keyed by field id. Read-only view. */
  readonly fields: ReadonlyMap<VolumeFieldId, VolumeFieldSettings>;
  /** The ids of every registered field. */
  registered(): readonly VolumeFieldId[];
  /** A field's params, or undefined if not registered. */
  params(id: VolumeFieldId): VolumeFieldSettings | undefined;
  /** Register (or update) a field's params. */
  setParams(id: VolumeFieldId, params: VolumeFieldSettings): void;
};
