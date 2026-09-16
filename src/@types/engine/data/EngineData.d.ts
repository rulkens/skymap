import type { StructureStore } from './StructureStore';
import type { BodyStore } from './BodyStore';

/**
 * EngineData — the per-type data stores sub-bag of `EngineState`.
 *
 * A store earns its place here when a type has authoritative app-side data no
 * runtime asset slot can supply, and the two ways that happens are:
 *
 * - Structures are a "rich" query target: the app CPU-queries them (InfoCard /
 *   picking / camera / membership) through transformed/indexed data the slot's
 *   raw `current()` can't give you. Galaxies were the other one, and left with
 *   the galaxyCatalog Layer — its runtime owns the catalog map now.
 * - Bodies (stars, planets, Earth) are authored seed constants: the scene's
 *   true-scale foreground has no fetched asset behind it, so `sceneBodies.ts`
 *   IS the source and the store is where those constants live at runtime.
 *
 * Filaments and flow have NO store: they held only a status-only `loaded` bit
 * that mirrored their asset slot's `ready` state. That mirror is gone — read
 * the slot through `slotFor(state, 'flow' / 'filaments')` instead.
 *
 * Volumes also have no store: their only app-side state is per-field settings,
 * which live in `state.settings.volumes.items` (ADR 0006 superseded the
 * volumeStore that ADR 0005 originally proposed for that type).
 */
export type EngineData = {
  readonly structures: StructureStore;
  readonly bodies: BodyStore;
};
