/**
 * DemandCtx — the read surfaces a demand predicate may consult.
 *
 * ### Why demand predicates exist
 *
 * The asset-wiring layer drives each slot's load lifecycle with a
 * `shouldLoad` predicate rather than an imperative `load()` call at each
 * call site.  Predicates are easier to compose, test in isolation, and
 * reason about at a glance: the entire load policy for filaments is
 * "settings say enabled AND the skeleton slot is idle."  The alternative —
 * scanning for every setFilamentsEnabled() callsite in engine.ts — spreads
 * policy across dozens of locations and makes it easy to miss an edge case
 * (e.g. filaments disabled mid-flight, tier change, source toggle off).
 *
 * ### The read surfaces (ADR 0005 §3)
 *
 *   1. `settings` — the `EngineSettingsState` (read-only view).  Covers
 *      master-enable toggles (`filaments.enabled`, `volumes.enabled`,
 *      `milkyWay.enabled`).  Most predicates start here.  Per-item gates
 *      read the type's items map directly — volumes via
 *      `settings.volumes.items[id]?.enabled`, structures via
 *      `settings.structures.items[cat].enabled`.
 *
 *   2. `isVisible` — the per-source drawMask bit.  A source-specific asset
 *      should only be loaded if its source is visible; this avoids
 *      background-loading a survey the user has toggled off.
 *
 *   3. `request` — one-shot transient flags (see `RequestKey`).  Covers
 *      discrete UI events that have no persistent settings counterpart —
 *      opening the palette picker, requesting a lazy PGC-alias load, etc.
 *      The flag is never cleared; the demand loop's idle-guard stops the
 *      already-loaded slot from re-fetching, so a set-and-leave flag is safe.
 *
 *   4. `slotState` — the `LoadStateKind` of any slot in the registry.
 *      Used for two patterns described in ADR 0005 §3:
 *
 *        - *Companion join*: an asset that should only start loading after
 *          its companion is `ready` (e.g. the famous-meta JSON waits until
 *          the famous `.bin` is committed to avoid a race where the InfoCard
 *          renders with metadata but no galaxy positions).
 *
 *        - *Fallback gate*: an asset whose predicate checks that a primary
 *          slot is `error` before attempting the cheaper fallback source
 *          (e.g. a local-cache fallback for a failed CDN fetch).
 *
 *      Both patterns are predicates over sibling slot states — exactly what
 *      this surface provides, without exposing the full `AssetSlot<T>`
 *      internals (value, req object, retry policy) to the predicate.
 *
 * Singleton overlay layers (filaments, milkyWay, flow) need no surface of
 * their own: their enable gate lives in `settings.<layer>.enabled`, read
 * through surface 1. See
 * `docs/superpowers/conventions/singleton-overlay-layers.md`.
 *
 * ### Readonly contract
 *
 * `DemandCtx` is consumed inside `shouldLoad` callbacks; those callbacks
 * must not mutate engine state.  The surfaces are read-only by construction:
 * `settings` is a `Readonly<EngineSettingsState>`, `isVisible`/`request`/
 * `slotState` are query functions that return read-only values.
 */

import type { EngineSettingsState } from '../settings/EngineSettingsState';
import type { SourceType } from '../data/SourceType';
import type { AssetKey } from './AssetKey';
import type { LoadState } from './LoadState';
import type { RequestKey } from './RequestKey';

export type DemandCtx = {
  /** Read-only view of the user-facing rendering settings. */
  settings: Readonly<EngineSettingsState>;
  /** Returns true when the given source's drawMask bit is set. */
  isVisible: (s: SourceType) => boolean;
  /** Returns true when the given one-shot request flag is pending. */
  request: (k: RequestKey) => boolean;
  /**
   * Returns the `kind` discriminant of the slot for the given asset key.
   * Used to express companion joins and fallback gates as predicates over
   * sibling slot states without exposing the full slot internals.
   */
  slotState: (k: AssetKey) => LoadState<unknown>['kind'];
};
