import type { GalaxyStore } from './GalaxyStore';
import type { StructureStore } from './StructureStore';
import type { VolumeStore } from './VolumeStore';
import type { FilamentStore } from './FilamentStore';
import type { FlowFieldStore } from './FlowFieldStore';

/**
 * EngineData — the per-type data stores sub-bag of `EngineState`.
 *
 * One store per data type, each the authoritative app-side home for its
 * type (ADR 0005). Galaxies and structures are "rich" (CPU-queried by
 * InfoCard / picking / camera / membership); volumes and filaments are
 * "thin" (the heavy payload is GPU-resident, the store tracks only status
 * + params). The uniform "store per type" shape replaces the pre-store
 * scatter across `state.sources.*` and `state.settings.volumes.fields`.
 */
export type EngineData = {
  readonly galaxies: GalaxyStore;
  readonly structures: StructureStore;
  readonly volumes: VolumeStore;
  readonly filaments: FilamentStore;
  readonly flow: FlowFieldStore;
};
