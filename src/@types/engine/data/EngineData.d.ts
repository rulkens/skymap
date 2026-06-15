import type { GalaxyStore } from './GalaxyStore';
import type { StructureStore } from './StructureStore';

/**
 * EngineData — the per-type data stores sub-bag of `EngineState`.
 *
 * Two stores, each the authoritative app-side home for a type that the app
 * CPU-queries: galaxies and structures (InfoCard / picking / camera /
 * membership). Both are "rich" — they hold transformed/indexed data the slot's
 * raw `current()` can't give you.
 *
 * Filaments and flow have NO store: they held only a status-only `loaded` bit
 * that mirrored their asset slot's `ready` state. That mirror is gone — read
 * `slotReady(state.assetSlots.flow / .filaments)` instead (filament counts reach
 * React via `cb.filaments.onReady`, never through a getter).
 *
 * Volumes also have no store: their only app-side state is per-field settings,
 * which live in `state.settings.volumes.items` (ADR 0006 superseded the
 * volumeStore that ADR 0005 originally proposed for that type).
 */
export type EngineData = {
  readonly galaxies: GalaxyStore;
  readonly structures: StructureStore;
};
