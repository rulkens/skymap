import type { GalaxyStore } from './GalaxyStore';
import type { StructureStore } from './StructureStore';
import type { FilamentStore } from './FilamentStore';
import type { FlowFieldStore } from './FlowFieldStore';

/**
 * EngineData — the per-type data stores sub-bag of `EngineState`.
 *
 * Three stores, each the authoritative app-side home for its type (ADR 0005).
 * Galaxies and structures are "rich" — CPU-queried by InfoCard / picking /
 * camera / membership. Filaments are "thin" — the heavy payload is
 * GPU-resident; the store tracks status only.
 *
 * Volumes have no store here: their only app-side state is per-field settings,
 * which live in `state.settings.volumes.items` (ADR 0006 superseded the
 * volumeStore that ADR 0005 originally proposed for that type).
 */
export type EngineData = {
  readonly galaxies: GalaxyStore;
  readonly structures: StructureStore;
  readonly filaments: FilamentStore;
  readonly flow: FlowFieldStore;
};
