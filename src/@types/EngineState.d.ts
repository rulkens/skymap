/**
 * EngineState — the canonical shape of every mutable runtime value the
 * engine owns.
 *
 * ### Why this type exists
 *
 * Phases 1–3 of the engine.ts refactor pulled per-frame GPU dispatch,
 * pointer/keyboard input wiring, click resolution, the SpaceMouse and
 * thumbnail subsystems, and the camera-tween facade out into siblings
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
 *   - `state.settings`   — what the SettingsPanel surfaces.
 *   - `state.bias`       — Malmquist-bias correction tuning.
 *   - `state.sources`    — loaded clouds + visibility selectors.
 *   - `state.picking`    — hover / click / drag mutables.
 *   - `state.gpu`        — pipelines / textures allocated lazily.
 *   - `state.subsystems` — owned long-lived helpers.
 *   - `state.cam`        — the orbit camera (null until first cloud).
 *   - `state.initialCamSnapshot` — framing snapshot for resetCamera().
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
 * subsystem facades (TweenManager, ThumbnailSubsystem) already manage
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

import type { EngineSettingsState } from './EngineSettingsState';
import type { EngineBiasState } from './EngineBiasState';
import type { EngineSourceState } from './EngineSourceState';
import type { EnginePickingState } from './EnginePickingState';
import type { EngineGpuHandles } from './EngineGpuHandles';
import type { EngineSubsystemHandles } from './EngineSubsystemHandles';
import type { createOrbitCamera } from '../services/camera/orbitCamera';
import type { InitialCam } from '../services/engine/camera/cameraFraming';
import type { AssetSlot } from '../services/loading/AssetSlot';
import type { PointCloud } from './PointCloud';
import type { PointCloudReq } from '../services/loading/fetchers/pointCloudFetcher';
import type { FilamentCloud } from './FilamentCloud';
import type { FilamentReq } from '../services/loading/fetchers/filamentFetcher';
import type { FamousPayload } from '../services/loading/fetchers/famousMetaFetcher';
import type { PgcAliasMap } from '../services/loading/fetchers/pgcAliasFetcher';
import type { ScalarCube } from './ScalarCube';
import type { SyntheticVolumeReq } from '../services/loading/fetchers/syntheticVolumeFetcher';
import type { Source } from '../data/sources';

/**
 * Asset-slot bag — owned by the engine and populated alongside the
 * GPU renderer.  The asset-loading rework migrates each per-source
 * fetch+upload path from the old imperative `cloudLoader.reloadSource`
 * to a `createAssetSlot` whose race-checked `commit` step is the
 * structural fix for tier-swap stomping bugs.  Task 8 introduced the
 * SDSS slot; Task 9 extends the bag with the other surveys (2MRS,
 * GLADE, Famous) plus the filament layer.
 *
 * `points` is keyed by Source so any future per-source consumer can
 * look up the active slot for a survey without iterating.  `filaments`
 * is a single slot rather than a map because filaments are a global
 * derived asset, not a per-survey one — the request type carries `tier`
 * alone, no `source`.
 *
 * Filaments load exactly once at boot and are NOT swapped on tier
 * change.  See `services/loading/fetchers/filamentFetcher.ts` for the
 * rationale (re-downloading tens of MB for what is mostly the same
 * skeleton topology isn't worth it).
 */
export type EngineAssetSlots = {
  points: Map<Source, AssetSlot<PointCloud, PointCloudReq>>;
  /**
   * Null until the GPU init IIFE constructs the filament renderer and
   * mints this slot — same lifecycle pattern as `state.gpu.renderer`.
   * Consumers null-check before calling `.load()` (in practice only the
   * boot path touches it, and only after the IIFE has populated it).
   */
  filaments: AssetSlot<FilamentCloud, FilamentReq> | null;
  /**
   * Famous-galaxy sidecar pair (`famous_meta.json` + `famous_xrefs.json`)
   * routed through a slot for parity with point loads.  Loaded eagerly at
   * engine boot — the JSON is tiny (well under 100 KB combined) so the
   * cost is negligible, and the InfoCard depends on `meta`/`xrefs` being
   * present whenever a famous galaxy is hovered.  The fetcher returns
   * both files combined; the subscriber writes them straight into
   * `state.sources.famousMeta` / `state.sources.famousXrefs`.
   *
   * No `commit` step — there is nothing GPU-side to upload, just CPU
   * state mutation done by the subscriber.  Null until the IIFE mints it
   * (matches `filaments` for the same lifecycle reason).
   */
  famousMeta: AssetSlot<FamousPayload, void> | null;
  /**
   * PGC → human-name alias map (`pgc_aliases.json`, ~1.7 MB).  Lazy:
   * the engine never auto-loads it; the public-handle's
   * `loadPgcAliases()` shim calls `slot.load()` on first palette open.
   * Same null-then-set lifecycle as the filament slot.
   *
   * Routed through a slot (rather than a direct fetch) so progress events
   * flow through the same `aggregateRegistry` reporter as every other
   * load, and so retry/cancel semantics match.
   */
  pgcAlias: AssetSlot<PgcAliasMap, void> | null;
  /**
   * CF-4 dark-matter density volume — Valade 2024 256³ HAMLET cube.
   *
   * Loaded eagerly at engine boot via `cf4DensityFetcher`; the slot's
   * commit registers the cube as the `'cf4-density'` field on the
   * scalar-volume renderer. Default-off in user settings, so the
   * extra ~32 MB of decoded voxel data is paid on every page load
   * but the field is invisible until the user toggles it on in the
   * Volumes panel.
   *
   * Null until the IIFE mints it (matches `filaments` for the same
   * lifecycle reason — the renderer must exist before the slot can
   * commit). Missing/404 .scfd surfaces as a never-fires commit; the
   * field simply won't appear in the Volumes panel.
   */
  cf4Density: AssetSlot<ScalarCube, void> | null;
  /**
   * Dev-only slots for the synthetic test cubes (Gaussian blob,
   * Cartesian grid, spherical grid).  `undefined` (not the slots being
   * null) in production builds — the `wireSlots` phase only mints
   * them when `import.meta.env.DEV` is true, so tree-shaking removes
   * the fetcher module + procedural generators entirely from
   * production bundles.
   *
   * Keyed by the in-engine handle the slot's commit registers, so
   * iterating the record is the same set of names that show up in
   * the SettingsPanel's Volumes section.  Engine bootstrap triggers
   * each slot's `.load()` independently with its own request.
   *
   * The `?` (optional) rather than `| null` mirrors how TypeScript
   * expresses "this property may not exist on the object at all",
   * which is more accurate here than null-then-set: in production
   * the field is never assigned, so accessing it returns `undefined`
   * rather than null.  Consumers should guard with `?.` at the call
   * site.
   */
  syntheticVolumes?: Record<string, AssetSlot<ScalarCube, SyntheticVolumeReq>>;
};

export type EngineState = {
  settings: EngineSettingsState;
  bias: EngineBiasState;
  sources: EngineSourceState;
  picking: EnginePickingState;
  gpu: EngineGpuHandles;
  subsystems: EngineSubsystemHandles;
  cam: ReturnType<typeof createOrbitCamera> | null;
  initialCamSnapshot: InitialCam | null;
  assetSlots: EngineAssetSlots;
};
