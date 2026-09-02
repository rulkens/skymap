/**
 * EngineState — the canonical shape of every mutable runtime value the
 * engine owns.
 *
 * ### Why this type exists
 *
 * Phases 1–3 of the engine.ts refactor pulled per-frame GPU dispatch,
 * pointer/keyboard input wiring, click resolution, the thumbnail
 * subsystem, and the camera-tween facade out into siblings
 * under `src/services/engine/`.  Each extraction shrank `frame()` and
 * the public-handle setters to thin orchestrators — but the *opening*
 * of `createEngine` still declared ~30 individual `let` bindings:
 * settings, bias thresholds, source visibility, picking flags, GPU
 * pipeline handles, subsystem handles, the camera, the framing
 * snapshot, and a handful of in-flight signals.
 *
 * Reading any one of those bindings was easy.  Answering "what state
 * does the engine own?" was hard — the bindings were scattered down
 * 250+ lines of header comments and weren't grouped by concern.  A
 * fresh reader (or a future Claude session) had to scroll the whole
 * preamble to learn the answer.
 *
 * Consolidating the bindings into a single `EngineState` value, with
 * sub-bags organised by concern, gives the engine one obvious answer.
 * The mental model becomes:
 *
 *   - `state.settings`   — the appearance knobs the SettingsPanel surfaces.
 *   - `state.tier`       — the data-resolution tier (its own root slice).
 *   - `state.data`       — per-type data stores (galaxies, structures, …).
 *   - `state.picking`    — hover / click / drag mutables.
 *   - `state.gpu`        — pipelines / textures allocated lazily.
 *   - `state.subsystems` — owned long-lived helpers.
 *   - `state.cam`        — the boot framing camera; non-null once `wireInput`
 *                          ran (the bootstrap-ready proxy).
 *
 * ### Why a single `const` instead of a class?
 *
 * The engine is a singleton: one canvas → one `createEngine` call →
 * one closure.  A class would gain only a `this.*` access pattern and
 * lose the clarity that the *outer* binding is immutable while every
 * *inner* field is mutated in place.  We use `const state: EngineState
 * = { ... }` so the closure cannot accidentally rebind the whole bag,
 * but `state.settings.brightness = 1.5` is still a one-liner.
 *
 * ### Why mutable in place rather than an immutable redux-style store?
 *
 * Per-frame writes happen in the rAF loop and the public-handle
 * setters fire several times per user interaction.  An immutable
 * setter (`state = { ...state, settings: { ...state.settings, brightness } }`)
 * would allocate two intermediate objects per slider drag — fine
 * for a React form, wasteful inside a 60 fps render loop.  Mutation
 * in place keeps allocations off the hot path and matches how the
 * subsystem facades (e.g. the impostor planners) already manage
 * their own internal state.
 *
 * ### What this type is NOT
 *
 * - It does not own any *behaviour*.  It only declares the shape.  The
 *   factory that builds an `EngineState` value lives in `engine.ts`'s
 *   closure because it needs the `device` / `canvas` / callbacks that
 *   the engine receives.
 * - It does not list every transient closure variable.  Helpers like
 *   `lastScaleSig`, `detachControls`, and `cssToTexPx` stay as plain
 *   bindings — they're either single-use or scoped to one helper, not
 *   part of the engine's runtime state surface.
 * - It does not capture *initial values*.  Defaults live in
 *   `data/defaults.ts`; the consumer constructs an `EngineState` by
 *   pulling those constants into the right sub-bag.
 *
 * The sub-bag types live in their own `.d.ts` siblings — one type per
 * file matches the rest of the `@types/` convention and lets each bag
 * carry its own multi-paragraph rationale without bloating the root
 * type's docstring.
 */

import type { Tier } from '../../data/Tier';
import type { EngineSettingsState } from '../../settings/EngineSettingsState';
import type { EngineData } from '../data/EngineData';
import type { EnginePickingState } from './EnginePickingState';
import type { EngineAssetSlots } from './EngineAssetSlots';
import type { EngineGpuHandles } from '../handles/EngineGpuHandles';
import type { EngineSubsystemHandles } from '../handles/EngineSubsystemHandles';
import type { createOrbitCamera } from '../../../utils/camera/createOrbitCamera';
import type { RequestKey } from '../../loading/RequestKey';
import type { CameraRuntime } from './CameraRuntime';
import type { SelectionState } from '../../store/SelectionState';
import type { SelectionRowsState } from '../../store/SelectionRowsState';
import type { FamousGalaxyMetaEntry } from '../../loading/FamousGalaxyMetaEntry';

export type EngineState = {
  settings: EngineSettingsState;
  /**
   * The live data-resolution tier. A getter delegating to the injected store
   * (`store.getState().tier`), mirroring the `settings` delegation above —
   * reads hand back the authoritative value with no parallel mirror to drift.
   * The tier saga owns the write (it dispatches the `tier` slice action); the
   * engine reads here.
   */
  tier: Tier;
  /**
   * The selection identity Intent (hover/select/focus refs). A getter
   * delegating to the injected store (`store.getState().selection`), like
   * `settings`/`tier` — the store is the single home, no engine-side mirror.
   * The pick path dispatches the writes; the engine reads here.
   */
  selection: SelectionState;
  /**
   * The saga-reconciled selection display rows. A getter delegating to
   * `store.getState().selectionRows`; the per-frame selection-ring + structure
   * focus readers read this.
   */
  selectionRows: SelectionRowsState;
  /**
   * The famous-galaxy metadata sidecar. A getter delegating to
   * `store.getState().engine.meta.famousGalaxies`; the asset slot is the sole
   * writer, the engine reads here.
   */
  readonly famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[];
  /**
   * Per-type data stores — the authoritative app-side home for each
   * data type (galaxies, structures, volumes, filaments). Slot commits
   * write; producers / UI / pick / camera read. See `EngineData`.
   */
  data: EngineData;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  cam: ReturnType<typeof createOrbitCamera> | null;
  /**
   * Live camera Resources: the animation clock, the projection config, and
   * the commit-on-edge bookkeeping (lastPose + prevActiveId). Constructed in
   * `engine.ts` alongside `frameRef` and seeded with placeholders;
   * `wireInput`'s bootstrap seed fills real values once the initial camera
   * exists. All three callers that need these Resources — `wireInput`
   * (gesture seed + focus `from`), `startLoop` (RunFrameDeps), and `runFrame`
   * (produce + commit-on-edge) — read from this single bag, eliminating the
   * 'which copy is live?' ambiguity.
   */
  cameraRuntime: CameraRuntime;
  assetSlots: EngineAssetSlots;
  /**
   * One-shot transient request flags read by demand predicates via
   * `DemandCtx.request(k)`. A `Set<RequestKey>` rather than a field on
   * `sources` because these are edge-triggered UI events (palette opened,
   * lazy alias requested) with no persistent settings or loaded-data home.
   * A flag is set and left set; the demand loop's idle-guard keeps the
   * triggered slot from re-fetching, so no clear-on-ready is needed. Empty
   * until the first such event fires.
   */
  requests: Set<RequestKey>;
};
