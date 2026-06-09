/**
 * EngineHandle — the public API surface returned by createEngine.
 *
 * After the H5 namespace restructure (2026-05-11), the handle is a thin
 * cluster of named sub-handles plus two root-level affordances (`destroy`
 * and `assetSlots`).  Every imperative knob — set point size, focus a
 * galaxy, register a volume field — lives on a topical sub-handle so the
 * React layer can subscribe to just the namespace it cares about without
 * pulling in the whole engine surface.
 *
 * Why the split: the previous flat shape had ~50 optional methods at the
 * root.  Adding a new feature meant another optional `setX` line and a
 * test for "is it wired?"; the type told you nothing about which methods
 * belong together.  The sub-handles group related methods (all camera
 * controls under `camera`, all volume controls under `volumes`) so the
 * type telegraphs intent and the engine's internal wiring stays
 * cluster-shaped.  See `docs/superpowers/plans/` for the H5 plan.
 */

import type { AssetSlot } from '../loading/AssetSlot';

import type { EnginePointsHandle } from './handles/EnginePointsHandle';
import type { EngineTonemapHandle } from './handles/EngineTonemapHandle';
import type { EngineCameraHandle } from './handles/EngineCameraHandle';
import type { EngineSelectionHandle } from './handles/EngineSelectionHandle';
import type { EngineSourcesHandle } from './handles/EngineSourcesHandle';
import type { EngineBiasHandle } from './handles/EngineBiasHandle';
import type { EngineThumbnailsHandle } from './handles/EngineThumbnailsHandle';
import type { EngineMilkyWayHandle } from './handles/EngineMilkyWayHandle';
import type { EngineFilamentsHandle } from './handles/EngineFilamentsHandle';
import type { EngineFlowFieldsHandle } from './handles/EngineFlowFieldsHandle';
import type { EngineLabelsHandle } from './handles/EngineLabelsHandle';
import type { EngineStructuresHandle } from './handles/EngineStructuresHandle';
import type { EngineVolumesHandle } from './handles/EngineVolumesHandle';
import type { EngineInputHandle } from './handles/EngineInputHandle';
import type { EngineDebugHandle } from './handles/EngineDebugHandle';

/**
 * Handle returned by `createEngine`. Lets the React layer drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
  // ── Sub-handles ───────────────────────────────────────────────────────────
  //
  // Each cluster's public surface lives in its own type alias so the
  // React shell can subscribe to just the namespace it cares about.
  points: EnginePointsHandle;
  tonemap: EngineTonemapHandle;
  camera: EngineCameraHandle;
  selection: EngineSelectionHandle;
  sources: EngineSourcesHandle;
  bias: EngineBiasHandle;
  thumbnails: EngineThumbnailsHandle;
  milkyWay: EngineMilkyWayHandle;
  filaments: EngineFilamentsHandle;
  flow: EngineFlowFieldsHandle;
  labels: EngineLabelsHandle;
  structures: EngineStructuresHandle;
  volumes: EngineVolumesHandle;
  input: EngineInputHandle;
  debug: EngineDebugHandle;

  /**
   * Stop the render loop, release GPU resources, and detach all event
   * listeners.  Lives at the root rather than a sub-handle because
   * destruction is a session-scoped operation, not a cluster knob.
   *
   * Call this from React's `useEffect` cleanup so that hot-reload and
   * StrictMode double-mounts don't leave orphaned RAF loops or GPU objects.
   */
  destroy: () => void;

  /**
   * Flat read-only registry of every asset slot the engine owns, keyed by
   * the slot's `name` (e.g. `'sdss-points'`, `'2mrs-points'`,
   * `'glade-points'`, `'famous-points'`, `'filaments'`, `'famous-meta'`,
   * `'pgc-aliases'`).  Type-erased to `AssetSlot<unknown, unknown>` because
   * the four point-cloud slots, the filament slot, and the two sidecar
   * slots all carry different payload + request shapes — the dev panel
   * only needs the discriminated `state()` projection, which is uniform
   * across slot types.
   *
   * Populated lazily as the async GPU init IIFE wires each slot, so the
   * Map may be empty for the very first frames after `createEngine`
   * returns.  The dev panel handles that by simply rendering zero rows
   * until subscriptions catch up.
   *
   * Read-only contract: callers must not mutate the Map or its slots
   * directly — drive them via `slot.load()` / `slot.forceReload()` /
   * `slot.cancel()` instead.
   */
  assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};
