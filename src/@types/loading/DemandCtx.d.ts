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
 *      `settings.structures.items[cat].enabled`, galaxy catalogs via
 *      `settings.galaxyCatalogs.items[id].enabled` (wiring rows hoist the
 *      source → galaxy-catalog-id registry mapping at construction).  The galaxy catalog
 *      bit is pure intent — written by the `setGalaxyCatalogVisible` slice
 *      action; the fade-tail drawMask is a render-side projection (`enabled ||
 *      fadeOpacity > 0`) and is not consulted: a just-disabled galaxy catalog
 *      stops demanding immediately while it fades out.
 *
 *   2. `request` — one-shot transient flags (see `RequestKey`).  Covers
 *      discrete UI events that have no persistent settings counterpart —
 *      opening the palette picker, requesting a lazy PGC-alias load, etc.
 *      The flag is never cleared; the demand loop's idle-guard stops the
 *      already-loaded slot from re-fetching, so a set-and-leave flag is safe.
 *
 *   3. `slotState` — the `LoadStateKind` of any slot in the registry.
 *      Used for two patterns described in ADR 0005 §3:
 *
 *        - *Companion join*: an asset that should only start loading after
 *          its companion is `ready` (e.g. the famous-galaxies-meta JSON waits until
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
 *   4. `cameraPosMpc` — the world-space camera eye position of the last produced
 *      pose. Exists because the body-surface texture family loads on proximity,
 *      not on a settings toggle or a slot-state join: each `bodyTextures` row
 *      demands its texture once the camera closes inside that body's load radius
 *      and releases it on retreat, both measured as `distanceMpc(cameraPosMpc,
 *      bodyPos)`. It reads the LAST produced pose because `reevaluateDemand` runs
 *      at the frame top, before this frame's camera is derived; the boxed
 *      `lastPose` is the live cross-driver position (wheel-zoom, tour clips, and
 *      the fly-to-Earth tween all converge to `CameraPose`), and a
 *      one-frame-stale position is immaterial for a multi-frame async fetch.
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
 * `settings` is a `Readonly<EngineSettingsState>`, `request`/`slotState` are
 * query functions that return read-only values.
 */

import type { EngineSettingsState } from '../settings/EngineSettingsState';
import type { AssetKey } from './AssetKey';
import type { LoadState } from './LoadState';
import type { RequestKey } from './RequestKey';
import type { Vec3 } from '../math/Vec3';

export type DemandCtx = {
  /** Read-only view of the user-facing rendering settings. */
  settings: Readonly<EngineSettingsState>;
  /** Returns true when the given one-shot request flag is pending. */
  request: (k: RequestKey) => boolean;
  /**
   * Returns the `kind` discriminant of the slot for the given asset key.
   * Used to express companion joins and fallback gates as predicates over
   * sibling slot states without exposing the full slot internals.
   */
  slotState: (k: AssetKey) => LoadState<unknown>['kind'];
  /**
   * World-space camera eye position of the last produced pose, in Mpc — the one
   * proximity read surface. The body-surface texture family's demand/release
   * predicates gate on `distanceMpc(cameraPosMpc, bodyPos)` against a per-body
   * load radius, loading a texture as the camera closes on its body and evicting
   * it as the camera leaves the neighbourhood. Derived from the same
   * `assembleOrbitCamera(pose, projection, poseBasis, upBasis)` the frame uses
   * for `drawCamPos`, so demand-time proximity and draw-time position agree.
   */
  cameraPosMpc: Readonly<Vec3>;
  /**
   * The sim instant (Julian days) the last frame derived its bodies at — the
   * clock's live position, read from `cameraRuntime.lastRenderedSimDays`. The
   * proximity gate needs it because a host body MOVES: its world position is
   * `deriveBodyStates(simDays)`, not a fixed epoch, so the body-texture family's
   * `distanceMpc(cameraPosMpc, bodyPos)` must measure against where the body sits
   * NOW. Paired with `cameraPosMpc` (the same last-frame origin) so demand-time
   * proximity reads the same body positions the frame drew.
   */
  simDays: number;
};
