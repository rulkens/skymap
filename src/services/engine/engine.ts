/**
 * Engine — the imperative WebGPU core, decoupled from any UI framework.
 *
 * This module is responsible for everything that touches the GPU, the camera,
 * and the raw browser input events. It knows nothing about React — it receives
 * simple callback functions and calls them when state changes.
 *
 * The boundary is deliberate:
 *
 *   Engine (engine.ts)            React (App.tsx, components/)
 *   ─────────────────────         ─────────────────────────────
 *   WebGPU device / buffers   ←→  status bar text
 *   requestAnimationFrame     ←→  info card fields
 *   pointer / keyboard events ←→  scale bar label + width
 *   orbit camera math
 *   GPU pick readback
 *
 * Callbacks are the seam. The engine fires `onStatusChange`, `onHoverChange`,
 * and `onSelectChange` only when values *actually change*, so the React side
 * can call `setState` directly without worrying about spurious re-renders.
 * Per-frame `onCameraChange` emissions instead fire unconditionally while
 * the camera exists; React-side `setState` equality checks filter the noise.
 *
 * ### Module layout
 *
 * The pure / leaf concerns and the cohesive subsystems live in sibling
 * modules so this file can stay focused on the imperative orchestration:
 *
 *   Pure helpers:
 *   - `galaxyFocusDistance.ts` / `structureFocusDistance.ts` — framing-distance helpers
 *   - `galaxyInfoBuilder.ts`   — buildGalaxyInfo / maxAbsCoord / niceRound
 *   - `cloudLoader.ts`         — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *   - `cameraFraming.ts`       — bbox + FOV → initial camera snapshot
 *   - `scaleBar.ts`            — pure scale-bar tick selection + label formatting (consumed by React)
 *
 *   Subsystems (closure-returning factories with internal state):
 *   - `tweenManager.ts`        — at-most-one in-flight CameraTween facade
 *   - `spaceMouseSubsystem.ts` — 6DOF puck device + per-frame camera mutation
 *   - `clickHandler.ts`        — pick → globalIdx → GalaxyInfo resolver
 *   - `inputBindings.ts`       — pointer/keyboard/resize listener bag
 *   - `thumbnailSubsystem.ts`  — atlas + queue + per-frame thumbnail draw
 *
 *   Bootstrap phases (the async IIFE, lifted out of this file):
 *   - `phases/initGpu.ts`      — device + every renderer + point-source slots
 *   - `phases/wireSlots.ts`    — sidecar slots + thumbnails + parallel load
 *   - `phases/wireInput.ts`    — pickRenderer + camera + orbit-controls + click
 *   - `phases/startLoop.ts`    — RunFrameDeps assembly + first requestRender
 *   - `phases/bootstrap.ts`    — orchestrator + BootstrapDeps + Phase signature
 *
 * Hover/select state lives in `state.subsystems.selection`
 * (`selectionSubsystem.ts`).  The public handle and the forward-declared
 * `frameRef` / `detachControlsRef` / `handleRef` boxes stay inline here
 * because the bootstrap phases (sibling modules) write them via the
 * `{current}` ref pattern.
 *
 * ### Usage
 *
 * ```ts
 * const handle = createEngine(canvas, {
 *   onStatusChange: (s) => setStatus(s),
 *   onHoverChange:  (p) => setReactHovered(p),
 *   onSelectChange: (p) => setReactSelected(p),
 *   onCameraChange: (snap) => setScale(computeScaleInfo({...})),
 * });
 *
 * // later (e.g. React cleanup):
 * handle.destroy();
 * ```
 */

import { Source, SOURCE_REGISTRY } from '../../data/sources';
import { ALL_VISIBLE_MASK } from '../../utils/allVisibleMask';
import { maskHas } from '../../utils/maskHas';
import type { SourceType } from '../../@types/data/SourceType';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_EXPOSURE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_FLOW,
} from '../../data/defaults';
import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import type { ScalarCube } from '../../@types/data/volume/ScalarCube';
import type { ScalarFieldPaletteId } from '../../@types/data/volume/ScalarFieldPaletteId';
import type { Tier } from '../../@types/data/Tier';
import type { FamousMetaEntry } from '../../@types/loading/FamousMetaEntry';

import { createTweenManager } from './camera/tweenManager';
import { createSettingsStore } from './settingsStore/createSettingsStore';
import { setBiasModeAction } from './settingsStore/actions/setBiasModeAction';
import { setVolumesEnabledAction } from './settingsStore/actions/setVolumesEnabledAction';
import { setFlowAction } from './settingsStore/actions/setFlowAction';
import { writeVolumeFieldAction } from './settingsStore/actions/writeVolumeFieldAction';
import { addVolumeFieldAction } from './settingsStore/actions/addVolumeFieldAction';
import { removeVolumeFieldAction } from './settingsStore/actions/removeVolumeFieldAction';
import { createEngineData } from './data/createEngineData';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../animation/fadeController';
import { createSelectionSubsystem } from './subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createYouAreHereSubsystem } from './subsystems/youAreHereSubsystem';
import { createLabelDirectorSubsystem } from './subsystems/labelDirectorSubsystem';
import { registerLabelStyleOverrideWake } from './labelStyleOverride';
import { produceStructureLabels } from './presentation/produceStructureLabels';
import { produceFamousLabels } from './presentation/produceFamousLabels';
import { createStructureFocusSubsystem } from './subsystems/structureFocusSubsystem';
import { createFpsCounter } from './subsystems/fpsCounter';
import { HDR_PASSES, UI_PASSES } from './frame/passes';
import { buildGalaxyInfo } from './helpers/galaxyInfoBuilder';
import { clearAll } from './helpers/clearAll';
import { commitFocus } from './helpers/commitFocus';
import { commitGalaxyFocus } from './helpers/commitGalaxyFocus';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { isStructure } from './isStructure';
import { logCameraState } from './helpers/logCameraState';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../@types/loading/PgcAliasMap';
import type { RequestKey } from '../../@types/loading/RequestKey';
import { awaitSlotReady } from '../loading/awaitSlotReady';
import { slotReady } from '../loading/slotReady';
import { tierTarget } from '../../data/tierTargets';
import { snapToCameraSnapshot, tweenToCameraSnapshot } from './camera/cameraSnapshot';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../data/milkyWay/galacticCenter';
import { seedVolumeFields } from '../../data/volume/volumeFieldDefaults';
import { buildVolumeFieldsSnapshot } from './helpers/buildVolumeFieldsSnapshot';
import { clampVolumeIntensity } from '../../utils/clampVolumeIntensity';
import { clampVolumeContrast } from '../../utils/clampVolumeContrast';
import { clampVolumeDensityScale } from '../../utils/clampVolumeDensityScale';
import { clampVolumeTrim } from '../../utils/clampVolumeTrim';
import { clampVolumeExposure } from '../../utils/clampVolumeExposure';
import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { StructureCategory } from '../../@types/data/structure/StructureCategory';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import { GALAXY_CATALOG_IDS } from '../../data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_CATEGORIES } from '../../data/structure/structureCategories';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem lives in `spaceMouseSubsystem.ts`.  Engine-side we
// instantiate it once with `cancelTween` / `onAxes` / `onConnectionChange`
// callbacks and call `applyToCamera()` from `frame()`; the handle's
// connect/disconnect/sensitivity setters forward straight through.
import { createSpaceMouseSubsystem } from './subsystems/spaceMouseSubsystem';
import { buildSettersFromTable } from './wiring/settingsTable';
import { reevaluateDemand } from './wiring/reevaluateDemand';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  loadCompanionAssets,
} from './wiring/galaxyCatalogSourceRegistry';
import type { SettingsTableKey } from '../../@types/settings/SettingsTableKey';
import { runBootstrapPhases } from './phases/bootstrap';
import { rebuildHiResFamousForTier } from './helpers/rebuildHiResFamousForTier';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';
import { setSourceVisibleImpl } from './handles/setSourceVisible';
import { setStructureItemEnabled } from './handles/setStructureItemEnabled';
import { setStructureLabelEnabled } from './handles/setStructureLabelEnabled';
import { setGalaxyCatalogLabelEnabled } from './handles/setGalaxyCatalogLabelEnabled';

/**
 * Start the WebGPU engine on `canvas`.
 *
 * Returns a handle synchronously; async setup (GPU init, data loading)
 * progresses in the background and is reported via `cb.onStatusChange`.
 *
 * ### Lifecycle
 *
 *   1. `cb.onStatusChange({ kind: 'initializing' })` fires immediately.
 *   2. `initGpu()` + `loadCloud()` run asynchronously.
 *   3. `cb.onStatusChange({ kind: 'loading' })` fires before the fetch.
 *   4. `cb.onStatusChange({ kind: 'ready', ... })` fires when the render loop
 *      starts, or `{ kind: 'error' }` if GPU init fails.
 *   5. `cb.onHoverChange`, `cb.onSelectChange`, `cb.onCameraChange` fire during
 *      steady-state rendering as the user interacts.
 *
 * @throws Never — errors are reported via `onStatusChange({ kind: 'error' })`.
 */

export function createEngine(canvas: HTMLCanvasElement, cb: EngineCallbacks): EngineHandle {
  // ── Mutable engine state ─────────────────────────────────────────────────
  //
  // Everything lives as closure variables rather than a class because the
  // engine is a singleton: one canvas → one engine → one set of state.
  // Closure variables are slightly simpler to reason about than `this.*` and
  // they keep the internal state completely inaccessible from outside.

  // The whole engine state — see `@types/EngineState.d.ts` (and the
  // per-sub-bag siblings) for the type-level map.  Sub-bag groupings:
  //
  //   - `settings`   → SettingsPanel knobs, seeded from `data/defaults.ts`
  //                    (the single source of truth shared with App.tsx).
  //   - `bias`       → Malmquist-bias bake outputs (apparentMagLimit + two
  //                    Schechter params), 0 until the shader's mode-2/3/4
  //                    branches activate.  The user knobs live on
  //                    `state.settings.bias`.
  //   - `sources`    → loaded `GalaxyCatalog`s + visibility bitmasks + tier
  //                    + optional famous-galaxy sidecars.
  //   - `picking`    → hover / click / drag mutables.
  //   - `gpu`        → renderers / HDR target / tone-map pass — null until
  //                    `initGpu` finishes.
  //   - `subsystems` → long-lived helpers; `tweens`/`spaceMouse` construct
  //                    up-front, the rest land later.
  //   - `cam` / `initialCamSnapshot` → orbit camera + framing snapshot,
  //                    null until the first cloud loads.
  //
  // The outer `state` binding is `const` — only inner fields mutate.
  // Mutation in place matches the subsystem facades and avoids per-frame
  // allocations on the hot path.

  // ── Frame-function forward declaration ────────────────────────────────────
  //
  // The render loop's `frame()` body lives in `runFrame.ts` (called from
  // the `startLoop` phase) because it reads GPU resources initGpu returns
  // asynchronously.  But the `RenderScheduler` in `state.subsystems.scheduler`
  // needs an `onFrame` callback at construction time — here, in the
  // synchronous state literal below.
  //
  // We resolve the chicken-and-egg with a `{ current }` ref holding a no-op
  // stub.  The scheduler captures `frameRef` via `() => frameRef.current()`,
  // so once `startLoop` assigns the real body, every rAF runs it.  A ref
  // (not a `let`) because the bootstrap phases are sibling modules where a
  // `let` would be invisible — same pattern as `lastReportedFps` (see
  // `BootstrapDeps` for the full ref inventory).
  //
  // The stub is a silent no-op: its only invocation window is "rAF fires
  // before startLoop wires `frameRef.current`", vanishingly rare and
  // harmless.
  const frameRef: { current: () => void } = {
    current: () => {
      /* stub until startLoop assigns the real body */
    },
  };

  // ── Rolling FPS counter ────────────────────────────────────────────────────
  //
  // Engine-scope so the same instance accumulates samples across every
  // frame() (a counter inside frame() would reset each call).  Thin closure
  // over a 60-frame ring buffer — see fpsCounter.ts.  `lastReportedFps`
  // throttles the callback fan-out to integer changes, so a steady
  // framerate fires once then goes silent instead of burning React renders.
  const fpsCounter = createFpsCounter(60);
  // Boxed as `{current}` so the frame body in `runFrame.ts` can write to it
  // across the module boundary.
  const lastReportedFps: { current: number | null } = { current: null };

  // ── Settings — the user-facing SettingsPanel sub-bags ──────────
  //
  // Every settings field lives under a named cluster (galaxy catalog billboard
  // knobs under `galaxyCatalogs`, HDR controls under `tonemap`, etc.). Defaults
  // flow from `data/defaults.ts`; see `EngineSettingsState.d.ts` for the
  // type-level map.
  //
  // We seed a zustand vanilla store (engine-owned, no React dependency in
  // the core) with this literal rather than parking it directly on
  // `state.settings`. `state.settings` then becomes a getter delegating to
  // `settingsStore.getState()`, so React can subscribe to settings changes
  // via `useStore` instead of keeping a parallel mirror that drifts. The
  // dozens of `state.settings.X` read sites stay byte-identical — the getter
  // hands back the held object directly.
  const settingsStore = createSettingsStore({
    // Galaxy catalog layer: master gate on + shared billboard appearance knobs +
    // one item row per galaxy catalog, each layer + label default-on. Keys are
    // DERIVED from `GALAXY_CATALOG_IDS` so the seed can't drift from the galaxy catalog set.
    // `labelEnabled` is inert for every galaxy catalog except famousGalaxy (the only
    // one that renders a name label) — seeded uniformly true.
    galaxyCatalogs: {
      enabled: true,
      sizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      depthFade: DEFAULT_DEPTH_FADE_ENABLED,
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnly: DEFAULT_REAL_ONLY_MODE,
      items: Object.fromEntries(
        GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
    },
    tonemap: {
      exposure: DEFAULT_EXPOSURE,
      curve: DEFAULT_TONE_MAP_CURVE,
    },
    camera: {
      autoRotate: DEFAULT_AUTO_ROTATE,
    },
    // Bias's user-tunable subset.  Bake-derived fields live on
    // `state.bias` (worker outputs, not settings).  The -19 default is
    // roughly where the SDSS spectroscopic main sample is volume-complete
    // out to the galaxy catalog's flux limit — bright enough that nearly every
    // catalog galaxy has a spectrum, dim enough to keep plenty of structure.
    bias: {
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: DEFAULT_ABS_MAG_LIMIT,
    },
    thumbnails: {
      enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
    },
    milkyWay: {
      enabled: DEFAULT_MILKY_WAY_ENABLED,
      labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
    },
    filaments: {
      enabled: SOURCE_REGISTRY[Source.Filaments].visible,
      intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
    },
    volumes: {
      enabled: DEFAULT_VOLUMES_ENABLED,
      items: seedVolumeFields(),
    },
    // Flow is a singleton overlay layer: all its user-facing state (master
    // gate + look/motion knobs) lives here, spread from the single
    // `DEFAULT_FLOW` seed. Flow has no data-layer store — "loaded" is the asset
    // slot's own `ready` state (`slotReady(assetSlots.flow)`).
    flow: { ...DEFAULT_FLOW },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
    },
    // Structure overlay: master gate on + one item row per category, each
    // ring + label default-on. Keys are DERIVED from `STRUCTURE_CATEGORIES`
    // so the seed can't drift from the category set (famous galaxies bear no
    // ring and so have no row here).
    structures: {
      enabled: true,
      items: Object.fromEntries(
        STRUCTURE_CATEGORIES.map((c) => [c, { enabled: true, labelEnabled: true }]),
      ) as Record<StructureCategory, StructureItemSettings>,
    },
  });

  const state: EngineState = {
    // `state.settings` delegates to the engine-owned store. Copy-on-write
    // writes (Plan 02's actions) change the ref only on user-driven changes,
    // so per-frame reads see a stable object; the in-place nested mutators
    // still alive in Phase 1 mutate that held object directly, which the
    // getter surfaces unchanged.
    get settings() {
      return settingsStore.getState();
    },
    bias: {
      // Bake-only sentinels — overwritten before the shader's mode-2/3/4
      // branches are reachable (see `setBiasMode`).  User-tunable mode +
      // absMagLimit live on `state.settings.bias`.
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
    sources: {
      // Two 32-bit bitmasks, one bit per `Source` enum value — DERIVED
      // outputs, not authoritative state.  From frame 1 onward
      // `deriveSourceMasks` owns them, recomputing both from each galaxy catalog's
      // `settings.galaxyCatalogs.items[id].enabled` + live fade opacity.
      //
      // ALL_VISIBLE_MASK matches what frame 1 derives (every galaxy catalog seeds
      // enabled), so pre-frame readers — the synthetic-fallback hiddenAtBoot
      // check, the UI visibility seed — see the same mask the loop will
      // compute.
      pickMask: ALL_VISIBLE_MASK,
      drawMask: ALL_VISIBLE_MASK,
      // Currently-loaded data tier, seeded from `cb.initialTier`; 'medium'
      // is the ~600k-galaxy desktop budget.  `setTier` mutates in place.
      tier: cb.initialTier ?? 'medium',
    },
    // Per-type data stores. Empty at construction; slot commits fill them.
    data: createEngineData(),
    picking: {
      // Per-frame pick-throttle state. Hover / select live on
      // `state.subsystems.selection`; see `EnginePickingState.d.ts`.
      latestMouseCss: null,
      lastPickedMouseCss: null,
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      // All GPU handles populate during the async IIFE below and
      // release in `destroy()`.  See `@types/EngineGpuHandles.d.ts`
      // for the null-until-init lifecycle rationale.
      renderer: null,
      pickRenderer: null,
      // Canonical fade + source + focus bind-group layouts. Built once in
      // initGpu and threaded into every renderer's createPipelineLayout so
      // consumers share one layout identity. See
      // services/gpu/bindGroupLayouts/fadeUniforms.ts (layout:'auto' trap).
      fadeBgl: null,
      sourceBgl: null,
      focusBgl: null,
      focusUniform: null,
      postProcess: null,
      volumeOffscreen: null,
      filamentRenderer: null,
      // labelRenderer + markerLineRenderer: null until initGpu finishes the
      // font-atlas fetch.  Excluded from isEngineReady (optional async
      // resources, null-checked at use by labelsPass / markerLinesPass).
      labelRenderer: null,
      markerLineRenderer: null,
      // null until initGpu; excluded from isEngineReady, null-checked at use.
      selectionRingRenderer: null,
      structureMarkerRenderer: null,
      // texturedDiskRenderer / proceduralDiskRenderer / milkyWayRenderer:
      // null until initGpu constructs them.  The frame body reads them via
      // RunFrameDeps; they live here so `destroy()` can reach them and so
      // later phases consume the same identities by reading `state.gpu.X`.
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      horizonShellRenderer: null,
      // null until initGpu; excluded from isEngineReady — volumeUpsamplePass
      // null-checks both before hasActiveFields(), so a null state no-ops.
      volumeFieldRenderer: null,
      flowFieldRenderer: null,
      volumeUpsample: null,
      // Debug overlays. null until initGpu; the per-frame consumer
      // null-checks each together with its `settings.debug.*` toggle.
      pickDebugOverlay: null,
      diskRadiusRing: null,
      // Per-pass GPU timing service.  Always non-null — a no-op stub until
      // initGpu swaps in the device-aware service.  Consumers gate on
      // `.enabled`.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      // ── LOD impostor planners + atlas ─────────
      // Null until `wireSlots` constructs them post-GPU init.  The hi-res
      // pair (LOD-3) is rebuilt per-tier so its `texture_2d_array` layerSide
      // matches the active tier; the others persist across tier changes.
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedDisks: null,
      hiResFamous: null,
      hiResFamousTexture: null,
      // ── Tween manager ──────────────────────────────────────────
      // At most one camera tween at a time.  Sites that mutate it:
      //   - public handle's focusOn / focusOnHome / selectFamous
      //     (start a tween — auto-replaces any running one),
      //   - pointerdown handler                (cancel on user grab),
      //   - SpaceMouse per-frame block         (cancel on puck deflect),
      //   - per-frame frame() loop             (advance + auto-clear).
      tweens: createTweenManager({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── SpaceMouse subsystem ──────────────────────────────────
      // All puck state lives inside the subsystem.  We hand it three
      // callbacks: cancelTween (yield the focus tween to user input),
      // onConnectionChange (UI indicator), onAxes (wake the loop).
      spaceMouse: createSpaceMouseSubsystem({
        cancelTween: () => state.subsystems.tweens.cancel(),
        onConnectionChange: (connected) => {
          // Single site for the connected-change echo (both connect +
          // disconnect); the subsystem owns the truth, handle methods don't
          // echo directly.
          cb.input?.spaceMouse?.onConnectedChange?.(connected);
          // Wake one frame so the still-animating predicate sees the
          // freshly-zeroed axes and lets the loop sleep cleanly — the only
          // wake on the disconnect path (handle.disconnect relies on it).
          state.subsystems.scheduler.requestRender();
        },
        onAxes: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Selection subsystem ──────────────────────────────────────
      // Owns hover / select state and fans out `cb.onHoverChange` /
      // `cb.onSelectChange` on actual change.  Eager (no GPU dep) so the
      // public handle can call into it from t=0.  Cloud + sidecar accessors
      // are closures (not snapshots) so the subsystem reads the LIVE map at
      // call time — see the module header for the tier-swap rationale.
      selection: createSelectionSubsystem({
        cb,
        getCloud: (s) => state.data.galaxies.catalogs.get(s),
        getFamousMeta: () => state.data.galaxies.famousMeta,
        // Structure-kind selections are ring hits (cluster / SC / void /
        // group); resolve them straight from the structure store. Famous
        // galaxies are selected via the point path (kind 'galaxy'), never here.
        getStructure: (id) => state.data.structures.byId(id),
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Bias-correction subsystem ─────────────────────────────────
      // Owns Malmquist-bias mode flags, cached per-source ratios/weights,
      // and the async bake state machine.  Eager (no GPU dep); the renderer
      // is wired during initGpu via `attachRenderer`.  `handle.setBiasMode`
      // calls into `setMode` here.  Production uses the module-level
      // Vite `?worker` runners; tests inject synchronous stubs.
      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.data.galaxies.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── You-are-here subsystem ───────────────────────────────────
      // Owns the "YOU ARE HERE" marker fade-alpha and drives the label +
      // marker-line renderers per frame.  Eager (no GPU dep); the renderers
      // are wired during initGpu via `attachRenderers` after the font-atlas
      // fetch.
      youAreHere: createYouAreHereSubsystem(),

      // ── Label director ───────────────────────────────────────────
      // The director owns the `labelRenderer.setLabels` /
      // `markerLineRenderer.setLines` calls and declutters across all its
      // `LabelProducer`s (youAreHere + the structure/famous label producers,
      // registered just after this literal).  Renderers are wired in during
      // initGpu so the director sees everything before the first frame.
      labelDirector: createLabelDirectorSubsystem(),

      // ── Cluster focus-mode subsystem ─────────────────────────────
      // Selection-driven: `runFrame` calls `update(selectedStructure, nowMs)` to
      // drive the 400 ms member-isolation fade and threads
      // `produceFocusUniforms` into the points draw.  Eager, no GPU dep.
      structureFocus: createStructureFocusSubsystem({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Render scheduler — eager, capture-safe ────────────────────
      // Created here (not a deferred shim): its `onFrame` closes over the
      // forward-declared `frame` binding, and the IIFE assigns the real
      // body before any rAF fires.  Anyone capturing the scheduler gets the
      // live one — a deferred shim by reference would break hover-pick on
      // first frames.
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // ── Fade registry ──────────────────────────────────────────
      // Eager so initGpu can register handles without a null-check. Pure
      // CPU — no GPU device at construction.
      fades: createFadeRegistry({
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // The rest land later in the IIFE once their deps (GPU device,
      // pickRenderer, scheduler) exist.
      clickResolver: null,
      inputBindings: null,
      // Download-progress aggregator — built inside the IIFE so
      // `cb.onLoadProgress` is the closure target.
      loadProgress: null,
    },
    cam: null,
    initialCamSnapshot: null,
    // ── Asset-loading slot bag ───────────────────────────────────────────
    //
    // Each slot is a race-checked fetch→commit pipeline (see
    // `services/loading/AssetSlot.ts`).  The Map is declared up-front so
    // consumers can `state.assetSlots.points.get(source)?.load(...)` without
    // a null check, but the slots are minted inside the GPU init IIFE: they
    // close over GPU handles (renderer, filamentRenderer,
    // volumeFieldRenderer) for their commit step, all null until initGpu
    // resolves.  Minting them all in one IIFE pass keeps the lifecycle
    // uniform — even the GPU-handle-free slots (famousMeta, pgcAlias) are
    // born there.
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      structureCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      // Tier-aware (unlike cf4Density): setTier reloads on tier change.
      mcpm: null,
      // Default-off velocity flow field; demand-loaded like cf4Density.
      flow: null,
    },
    // ── One-shot transient request flags ────────────────────────────────
    //
    // Edge-triggered UI events that drive demand predicates (palette opened,
    // lazy alias requested) with no persistent home.  The wiring layer sets
    // a key and leaves it set — the demand loop's idle-guard prevents a
    // re-fetch, so no clear is needed.  See `@types/loading/RequestKey.d.ts`.
    requests: new Set<RequestKey>(),
    // ── Debug-only per-frame skip flags ─────────────────────────────────
    //
    // The DebugPanel mutates this via `passOverrides` to flip individual
    // passes off and distinguish overlapping draws.  Empty in production —
    // one `Set.has` per pass per frame, noise next to the GPU dispatch.
    debug: { disabledPasses: new Set<string>() },
  };

  // ── Register label producers with the director ───────────────────────
  //
  // Registration order = merged label order: youAreHere, then the structure
  // labels, then the famous-galaxy labels.  The director declutters across
  // all of them by `prominencePx`, so registration order only sets the
  // tiebreak for equal-prominence collisions (rare).  The structure + famous
  // producers are pure functions over the stores; wrap each as a LabelProducer
  // with a stable id.  All eager, so this is synchronous before any frame.
  state.subsystems.labelDirector.registerProducer(state.subsystems.youAreHere);
  state.subsystems.labelDirector.registerProducer({
    id: 'structureLabels',
    produceLabels: produceStructureLabels,
  });
  state.subsystems.labelDirector.registerProducer({
    id: 'famousLabels',
    produceLabels: produceFamousLabels,
  });

  // ── Wake on label-style override edits ────────────────────────────────
  //
  // The DebugPanel writes to `labelStyleOverride`, bumping a version the
  // director reads from its signature hash — but render-on-demand only
  // consults that hash inside an active frame, so idle slider edits would
  // sit invisible.  Registering requestRender here wakes the loop on every
  // set/clear.
  registerLabelStyleOverrideWake(() => state.subsystems.scheduler.requestRender());

  // ── Cleanup function returned by `attachOrbitControls` ─────────────────
  // Orbit-controls attachment lives outside `inputBindings` because it
  // needs a fully-constructed OrbitCamera, absent at engine() time.  A
  // transient local (single teardown fn, no other consumers), boxed as
  // `{current}` because `attachOrbitControls` runs in the `wireInput`
  // sibling phase.  `destroy()` reads through the ref to detach.
  const detachControlsRef: { current: (() => void) | null } = { current: null };

  // ── Async startup ────────────────────────────────────────────────────────

  // Flat slot registry keyed by `slot.name`, at outer scope so the public
  // handle exposes it as `assetSlots` (the `LoadingDevPanel`).  The IIFE
  // populates it as each slot is minted.  The same instance feeds the
  // load-progress emitter, so the loading bar and dev panel agree on what's
  // in flight.
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.lifecycle?.onStatusChange?.({ kind: 'initializing' });

  // ── Bootstrap dependency bag ─────────────────────────────────────────────
  //
  // The four bootstrap phases consume a shared `BootstrapDeps` built here:
  // the canvas + cb args, `{current}` ref boxes for forward-declared
  // bindings (frameRef, detachControlsRef, handleRef), and the values
  // `startLoop` needs for `RunFrameDeps` (fpsCounter, lastReportedFps,
  // allSlots).
  //
  // `handleRef.current` is null here — the handle is declared after the
  // IIFE below.  `wireInput`'s onDoubleClick reads it lazily, so it's
  // non-null by the time a user can physically double-click.
  const handleRef: { current: EngineHandle | null } = { current: null };
  const bootstrapDeps: BootstrapDeps = {
    canvas,
    cb,
    frameRef,
    detachControlsRef,
    handleRef,
    allSlots,
    fpsCounter,
    lastReportedFps,
  };
  // The main async IIFE runs the bootstrap phases; all errors are caught
  // and reported via `onStatusChange`.  See `runBootstrapPhases`.
  (async () => {
    try {
      await runBootstrapPhases(state, bootstrapDeps);
    } catch (err) {
      // Surface initialisation failures via the status callback so the UI
      // shows a readable message rather than a blank canvas.
      const message = err instanceof Error ? err.message : String(err);
      cb.lifecycle?.onStatusChange?.({ kind: 'error', message });
      console.error('Engine startup failed:', err);
    }
  })();

  // ── Public handle ─────────────────────────────────────────────────────────
  //
  // The table-driven setters land in `boringSetters`; bespoke ones (async
  // bakes, subsystem forwards, multi-field mutations) are local functions
  // below.  The handle literal at the end stitches both into the public
  // sub-handle clusters.
  const boringSetters = buildSettersFromTable(
    () => state.subsystems.scheduler.requestRender(),
    settingsStore,
  ) satisfies Record<SettingsTableKey, (value: unknown) => void>;

  // ── Bespoke methods (don't fit the settingsTable shape) ────────────
  //
  // Each owns work the descriptor table can't express: async worker bakes,
  // per-source slot reloads, subsystem forwards, multi-field mutations, or
  // returning live state.  Declared up-front so the sub-handle literal can
  // reference each by name — no forward references, no `!` assertions.

  function clearSelection(): void {
    // Unified teardown — clears galaxy/structure selection AND the focus slot
    // (so the cluster-focus fade collapses) in one call.  Each setter owns
    // its own dedupe and render wake; clearAll just pairs the two calls.
    // See clearAll.ts for the dismiss-vs-deselect rationale.
    clearAll(state.subsystems.selection);
  }

  function setBiasMode(mode: BiasMode): void {
    // Shader branches on the integer mode (0 = none, 1 = volume-limited, …),
    // so flipping it takes effect next frame with no pipeline rebuild.  The
    // store action owns the (copy-on-write) write; React reads via
    // `selectBiasMode`, so no echo is wired.  The worker re-bake is a separate
    // event-driven action: it routes through `biasCorrectionSubsystem`, which
    // owns the cached ratios/weights + worker runners and the render wakes
    // (entry + post-splice).  The `void` discards the Promise — engine.ts
    // doesn't await.
    setBiasModeAction(settingsStore, mode);
    void state.subsystems.biasCorrection.setMode(mode);
  }

  function resetCamera(): void {
    // Snapshot null-check; cam-null is absorbed inside the helper.
    // Both must exist for a meaningful snap.
    if (!state.initialCamSnapshot) return;
    snapToCameraSnapshot(state, state.initialCamSnapshot);
  }

  function focusOn(target: FocusableTarget): void {
    // Dispatch by type — one public method, two separate commit paths
    // (different tween shapes, cam-null gating, callbacks).  See commitFocus.
    //
    // The galaxy branch keeps the cam-null guard: without it a focus during
    // bootstrap would set `#focus=…` while the camera stays put.  The
    // structure branch skips the guard so deep-link drains can land
    // structure state pre-camera (see commitStructureFocus).
    if (!isStructure(target) && !state.cam) return;
    commitFocus(state, target);
  }

  function focusOnHome(): void {
    // Snapshot null-check; cam-null is absorbed inside the helper.
    if (!state.initialCamSnapshot) return;

    // Returning to the home view means we're no longer focused on
    // anything: drop the focus slot, which collapses the cluster-focus
    // fade AND fires `onFocusChange(null)` so the URL clears its
    // `#focus=…`.  Stays at the call site (not in the helper) because
    // "this action is leaving a focus state" is something
    // `tweenToCameraSnapshot` doesn't decide.
    state.subsystems.selection.setFocused(null);

    tweenToCameraSnapshot(state, state.initialCamSnapshot);
  }

  function focusOnMilkyWay(): void {
    // Distinct from `focusOnHome` (the wide hundreds-of-Mpc framing): this
    // tweens inside the impostor's full-visibility band so the Milky Way is
    // the dominant subject — target Sgr A*, ride in to
    // `MILKY_WAY_VIEW_DISTANCE_MPC`, preserve the user's yaw/pitch to avoid
    // a disorienting snap.  Reuses `tweenToCameraSnapshot` with a
    // synthesized snapshot.
    const cam = state.cam;
    if (!cam) return;

    // Not a catalog object — drop the focus slot so the URL hash doesn't
    // resolve a stale one and the cluster-focus fade collapses on the
    // way to the Milky Way.  `setFocused(null)` fires `onFocusChange`.
    state.subsystems.selection.setFocused(null);

    tweenToCameraSnapshot(state, {
      target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
      distance: MILKY_WAY_VIEW_DISTANCE_MPC,
      yaw: cam.yaw,
      pitch: cam.pitch,
      fovYRad: cam.fovYRad,
      near: cam.near,
      far: cam.far,
    });
  }

  function logCameraStateFn(): void {
    logCameraState(state.cam);
  }

  function selectFamous(id: string): void {
    // Guard: the famous catalog may not be loaded yet (sidecars arrive
    // slightly after the point cloud).  Early return is cosmetically safe.
    const cloud = state.data.galaxies.catalogs.get(Source.FamousGalaxy);
    if (!cloud) return;
    const localIdx = state.data.galaxies.famousMeta.findIndex((m) => m.id === id);
    if (localIdx < 0) return;

    // Build the GalaxyInfo the picker would, from live sidecars.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      Source.FamousGalaxy,
      state.data.galaxies.famousMeta,
    );
    if (!info) return;

    // A palette pick is a deliberate focus action, so move the camera too.
    commitGalaxyFocus(state, info);
  }

  type SelectByAliasTarget = {
    source: SourceType;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
  };

  function selectByAlias({ source, localIdx, famousMeta }: SelectByAliasTarget): void {
    // Guard: the source cloud may not be loaded yet, or localIdx could be
    // stale across a tier swap.  Both early-return safely.
    const cloud = state.data.galaxies.catalogs.get(source);
    if (!cloud) return;
    if (localIdx < 0 || localIdx >= cloud.count) return;

    // Caller-supplied `famousMeta` wins over the engine's copy — see the
    // EngineHandle JSDoc for the race this defends against.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      source,
      famousMeta ?? state.data.galaxies.famousMeta,
    );
    if (!info) return;

    commitGalaxyFocus(state, info);
  }

  function loadPgcAliasesFn(): Promise<PgcAliasMap> {
    // Set the edge-triggered flag and wake the loop: the pgcAlias row demands
    // on `request('paletteOpened')`, so the next `reevaluateDemand` fires the
    // load.  The flag stays set (idle-guard prevents a re-fetch), so a second
    // open resolves off the ready slot.  An errored load isn't retried;
    // awaitSlotReady then yields the empty-map fallback.
    state.requests.add('paletteOpened');
    state.subsystems.scheduler.requestRender();
    return awaitSlotReady(state.assetSlots.pgcAlias, new Map() as PgcAliasMap);
  }

  function setSourceVisible(source: SourceType, visible: boolean): void {
    // Delegate to the module-scope helper (testable without a GPU engine).
    // The per-galaxy-catalog `enabled` flag is written through the settings store so
    // React's `useSettingsStore(selectVisibleSourceMask)` subscriber wakes.
    setSourceVisibleImpl(state, settingsStore, source, visible);
  }

  function setTier(tier: Tier): void {
    if (tier === state.sources.tier) return;
    const prevTier = state.sources.tier;
    state.sources.tier = tier;
    cb.sources?.onTierChange?.(tier);

    // For each tier-relevant source: same target → skip; different target →
    // hand the slot the new request (it cancels any in-flight load,
    // re-fetches the tier's `.bin`, commits).  Hidden sources skip too —
    // toggling one on later loads it at the current tier via
    // `setSourceVisible`.  Filaments are NOT swapped (see `filamentFetcher.ts`).
    for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
      const src = cfg.source;
      if (cfg.category === 'synthetic') continue;
      if (tierTarget(src, prevTier) === tierTarget(src, tier)) continue;
      if (!maskHas(state.sources.drawMask, src)) continue;
      state.assetSlots.points.get(src)?.load({ source: src, tier });
      // Companion sidecars reload in lockstep so localIdx lookups stay valid.
      loadCompanionAssets(state, cfg, tier);
    }

    // MCPM volume is tier-aware (unlike CF-4); same per-tier reload via the
    // AssetSlot machinery.
    state.assetSlots.mcpm?.load({ tier });

    // The hi-res LOD-3 famous-galaxy texture is tier-aware on its layerSide.
    // WebGPU textures are immutable in shape, so a tier flip destroys +
    // recreates the texture + planner pair and re-binds the renderer's
    // hi-res view (see `helpers/rebuildHiResFamousForTier.ts`).  device +
    // texturedDiskRenderer are null until initGpu, so the guard skips the
    // rebuild pre-bootstrap (e.g. a test driving the handle directly).
    const device = bootstrapDeps.phaseLocals?.device;
    const texturedDiskRenderer = state.gpu.texturedDiskRenderer;
    if (device && texturedDiskRenderer) {
      rebuildHiResFamousForTier({
        state,
        device,
        tier,
        texturedDiskRenderer,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      });
    }
  }

  function getCloud(source: SourceType): GalaxyCatalog | undefined {
    return state.data.galaxies.catalogs.get(source);
  }

  function getCloudObjIds(source: SourceType): BigUint64Array | undefined {
    return state.data.galaxies.catalogs.get(source)?.objIDs;
  }

  function setVolumesEnabled(enabled: boolean): void {
    // Master toggle — dispatch the copy-on-write store action so the per-frame
    // volume gates see it next frame.  No echo: React reads via
    // `selectVolumesEnabled`.
    setVolumesEnabledAction(settingsStore, enabled);
    // Drive the FadeRegistry on the volumesMaster handle.  The encodeHdr*
    // sites multiply this master opacity into every per-field fade, so the
    // whole subsystem ramps in lockstep.  The pass-enabled gate accepts
    // the master enable bit OR opacity > 0, so it keeps blitting through fade-out.
    // fadeTo owns the render wake.
    void state.subsystems.fades.fadeTo(
      { kind: 'volumesMaster' },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
  }

  function addVolumeField(fieldId: VolumeFieldId, cube: ScalarCube): void {
    // Ensure a settings row exists before the GPU upload.  Re-registering a
    // field preserves its tuned values (identity no-op in the reducer); a
    // brand-new handle seeds from registry defaults.  Shippable volumes already
    // have a construction seed, so this only seeds for a dynamically-added
    // handle.  React reads the per-field rows via `selectVolumeFieldItems`.
    addVolumeFieldAction(settingsStore, fieldId);
    // Upload to the renderer; a silent no-op if it isn't ready yet (re-add
    // once booted).
    state.gpu.volumeFieldRenderer?.upload(fieldId, cube);
    // Drive the FadeRegistry from the settings enable bit: enabled → fade to 1;
    // disabled → leave it at the 0 set by onFieldAdded (the draw loop's
    // `(!enabled && opacity <= 0)` skip keeps it invisible until toggled on).
    if (state.settings.volumes.items[fieldId]?.enabled) {
      void state.subsystems.fades.fadeTo(
        { kind: 'scalarField', field: fieldId },
        1,
        FADE_IN_DURATION_MS,
      );
    }
    // Essential wake: the fadeTo above is conditional — a disabled add still
    // changes the renderer's field set and settings row.
    state.subsystems.scheduler.requestRender();
  }

  function removeVolumeField(fieldId: VolumeFieldId): void {
    state.gpu.volumeFieldRenderer?.unload(fieldId);
    removeVolumeFieldAction(settingsStore, fieldId);
    // Essential wake: removal fires no fade — the field vanishes outright.
    state.subsystems.scheduler.requestRender();
  }

  /**
   * Lazy-load the DEV-only debug volume slot backing a field if it's `idle`.
   * The shippable volumes (CF-4, MCPM) load via `reevaluateDemand` instead
   * (their demand reads `items[id].enabled`); the debug fixtures are
   * excluded from the registry, so they keep a direct lazy-load.
   *
   * Idempotent (a non-idle slot no-ops, so off-then-on doesn't re-fetch),
   * and a no-op for cf4/mcpm ids — so the two load mechanisms partition.
   */
  function maybeLazyLoadDebugVolume(fieldId: VolumeFieldId): void {
    switch (fieldId) {
      case 'debug-gaussian':
      case 'debug-cartesian':
      case 'debug-spherical': {
        const slot = state.assetSlots.syntheticVolumes?.[fieldId];
        if (!slot || slot.state().kind !== 'idle') return;
        // Same dims + box-size triple across all three fixtures so they
        // overlay coherently when more than one is enabled at once.
        const shape =
          fieldId === 'debug-gaussian'
            ? 'gaussian'
            : fieldId === 'debug-cartesian'
              ? 'cartesian'
              : 'spherical';
        slot.load({ id: fieldId, shape, dims: 64, boxSizeMpc: 400 });
        return;
      }
    }
  }

  function setVolumeFieldEnabled(fieldId: VolumeFieldId, enabled: boolean): void {
    // Dispatch the copy-on-write store action; React reads via
    // `selectVolumeFieldItems`.  An unknown id lands an identity write (no-op).
    writeVolumeFieldAction(settingsStore, fieldId, { enabled });
    // DEV debug fixtures aren't demand rows, so they keep a direct lazy load
    // here; cf4/mcpm load via reevaluateDemand reading items[id].enabled, and
    // this call is a no-op for those ids, so the two load paths partition.
    if (enabled) maybeLazyLoadDebugVolume(fieldId);
    // Drive the FadeRegistry: the draw loop's `(!enabled && opacity <= 0)` skip
    // keeps rendering through fade-out so the blend reaches zero before stopping.
    void state.subsystems.fades.fadeTo(
      { kind: 'scalarField', field: fieldId },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    // No requestRender: fadeTo wakes, and that frame's reevaluateDemand sees
    // the flipped enabled bit for the shippable cf4/mcpm rows.
  }

  // The per-field knob setters below dispatch the copy-on-write store action —
  // no boringSetter, no fade, so no channel wakes for them.  Each keeps an
  // explicit requestRender to re-render the raymarch pass.  Each clamps raw
  // intent before the write; React reads via `selectVolumeFieldItems`.

  function setVolumeFieldIntensity(fieldId: VolumeFieldId, intensity: number): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      intensity: clampVolumeIntensity(intensity),
    });
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldContrast(fieldId: VolumeFieldId, contrast: number): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      contrast: clampVolumeContrast(contrast),
    });
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldDensityScale(fieldId: VolumeFieldId, value: number): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      densityScale: clampVolumeDensityScale(value),
    });
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldTrim(fieldId: VolumeFieldId, trim: number): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      trim: clampVolumeTrim(trim),
    });
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldExposure(fieldId: VolumeFieldId, exposure: number): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      exposure: clampVolumeExposure(exposure),
    });
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldPalette(fieldId: VolumeFieldId, id: ScalarFieldPaletteId): void {
    writeVolumeFieldAction(settingsStore, fieldId, {
      paletteId: id,
    });
    state.subsystems.scheduler.requestRender();
  }

  function listVolumeFields(): VolumeFieldId[] {
    // Settings keys are the source of truth for which fields exist; mirrors
    // buildVolumeFieldsSnapshot so both views of identity stay in sync.
    return Object.keys(state.settings.volumes.items) as VolumeFieldId[];
  }

  function getVolumeFieldsState(): ReadonlyArray<VolumeFieldRowData> {
    return buildVolumeFieldsSnapshot(state);
  }

  async function connectSpaceMouse(): Promise<boolean> {
    const result = await state.subsystems.spaceMouse.connect();
    return result.ok;
  }

  function disconnectSpaceMouse(): void {
    // No requestRender: a real disconnect fires onConnectionChange (which
    // wakes); with no device open nothing observable changes.
    state.subsystems.spaceMouse.disconnect();
  }

  function isSpaceMouseConnected(): boolean {
    return state.subsystems.spaceMouse.isConnected();
  }

  function setSpaceMouseSensitivity(value: number): void {
    state.subsystems.spaceMouse.setSensitivity(value);
  }

  function destroy(): void {
    // Every subsystem and renderer satisfies `Destroyable`, so this reads as
    // a flat list of `.destroy()` calls.  Ordering is load-bearing only for
    // the first two groups (scheduler before everything; DOM listeners
    // before the subsystems they fire into); past that it's free.

    // 1. Cancel the render loop first — every subsequent destroy() must be
    //    safe after the loop has stopped.
    state.subsystems.scheduler.destroy();

    // 2. Detach DOM listeners before the subsystems they fire into.
    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;

    // 3. Walk every other subsystem (order-independent past here).
    state.subsystems.selection.destroy();
    state.subsystems.tweens.destroy();
    state.subsystems.biasCorrection.destroy();
    state.subsystems.youAreHere.destroy();
    state.subsystems.labelDirector.destroy();
    state.subsystems.structureFocus.destroy();
    // Impostor teardown order matters: texturedDisks subscribes to
    // galaxyAtlas's eviction handler (destroy it first); hiResFamous
    // subscribes to its texture's evict handler (destroy the planner before
    // the texture); galaxyAtlas releases its GPU texture last.
    state.subsystems.texturedDisks?.destroy();
    state.subsystems.texturedDisks = null;
    state.subsystems.hiResFamous?.destroy();
    state.subsystems.hiResFamous = null;
    state.subsystems.hiResFamousTexture?.destroy();
    state.subsystems.hiResFamousTexture = null;
    state.subsystems.proceduralDisks?.destroy();
    state.subsystems.proceduralDisks = null;
    state.subsystems.galaxyAtlas?.destroy();
    state.subsystems.galaxyAtlas = null;
    state.subsystems.spaceMouse.destroy();
    state.subsystems.clickResolver?.destroy();
    state.subsystems.clickResolver = null;
    state.subsystems.loadProgress?.destroy();
    state.subsystems.loadProgress = null;

    // 4. GPU renderers.  WebGPU buffers/textures don't release via JS GC, so
    //    destroy() is mandatory.  The point renderer owns the largest
    //    allocations (per-source vertex buffers, ~14 MB GPU + CPU mirror per
    //    SDSS deck).
    state.gpu.pickRenderer?.destroy();
    state.gpu.pickRenderer = null;
    state.gpu.postProcess?.destroy();
    state.gpu.postProcess = null;
    state.gpu.volumeOffscreen?.destroy();
    state.gpu.volumeOffscreen = null;
    state.gpu.filamentRenderer?.destroy();
    state.gpu.filamentRenderer = null;
    state.gpu.labelRenderer?.destroy();
    state.gpu.labelRenderer = null;
    state.gpu.markerLineRenderer?.destroy();
    state.gpu.markerLineRenderer = null;
    state.gpu.selectionRingRenderer?.destroy();
    state.gpu.selectionRingRenderer = null;
    state.gpu.structureMarkerRenderer?.destroy();
    state.gpu.structureMarkerRenderer = null;
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayRenderer?.destroy();
    state.gpu.milkyWayRenderer = null;
    state.gpu.horizonShellRenderer?.destroy();
    state.gpu.horizonShellRenderer = null;
    state.gpu.volumeFieldRenderer?.destroy();
    state.gpu.volumeFieldRenderer = null;
    state.gpu.flowFieldRenderer?.destroy();
    state.gpu.flowFieldRenderer = null;
    state.gpu.volumeUpsample?.destroy();
    state.gpu.volumeUpsample = null;
    state.gpu.pickDebugOverlay?.destroy();
    state.gpu.pickDebugOverlay = null;
    state.gpu.diskRadiusRing?.destroy();
    state.gpu.diskRadiusRing = null;
    state.gpu.timingService.destroy();
    state.gpu.timingService = createDisabledGpuTimingService();
    state.gpu.renderer?.destroy();
    state.gpu.renderer = null;
    // Shared cluster-focus uniform — released after the renderers that bind
    // its group (points/disks/pick already destroyed above).
    state.gpu.focusUniform?.destroy();
    state.gpu.focusUniform = null;

    // 5. Drop remaining strong references to aid GC.
    for (const source of [...state.data.galaxies.catalogs.keys()]) {
      state.data.galaxies.removeCatalog(source);
    }
    state.cam = null;
  }

  // ── Handle literal — sub-handle clusters + destroy + slots ──
  //
  // Each sub-handle is a thin forwarder onto a local function or a
  // `boringSetters` entry.  This literal is the only public surface.
  const handle: EngineHandle = {
    galaxyCatalogs: {
      setSize: (sizePx) => boringSetters.setPointSize(sizePx),
      setBrightness: (value) => boringSetters.setBrightness(value),
      setDepthFade: (enabled) => boringSetters.setDepthFadeEnabled(enabled),
      setHighlightFallback: (enabled) => boringSetters.setHighlightFallback(enabled),
      setRealOnly: (enabled) => boringSetters.setRealOnlyMode(enabled),
      setLabelEnabled: (galaxyCatalog, enabled) =>
        setGalaxyCatalogLabelEnabled(state, settingsStore, galaxyCatalog, enabled),
    },
    tonemap: {
      setExposure: (value) => boringSetters.setExposure(value),
      setCurve: (curve) => boringSetters.setToneMapCurve(curve),
    },
    camera: {
      setAutoRotate: (enabled) => boringSetters.setAutoRotate(enabled),
      reset: resetCamera,
      focusOn,
      focusOnHome,
      focusOnMilkyWay,
      logState: logCameraStateFn,
    },
    selection: {
      clear: clearSelection,
      selectFamous,
      selectByAlias,
      loadAliases: loadPgcAliasesFn,
    },
    sources: {
      setVisible: setSourceVisible,
      setTier,
      getCloud,
      getCloudObjIds,
    },
    bias: {
      setMode: setBiasMode,
      setAbsMagLimit: (absMag) => boringSetters.setAbsMagLimit(absMag),
    },
    thumbnails: {
      setEnabled: (enabled) => boringSetters.setGalaxyTexturesEnabled(enabled),
    },
    milkyWay: {
      // Drive the FadeRegistry alongside the boolean flip for a smooth ramp.
      // milkyWayPass.enabled accepts the boolean OR a non-zero opacity, so
      // the gate keeps the pass alive through fade-out.  The boringSetter and
      // fadeTo both wake the scheduler — no extra requestRender.
      setEnabled: (enabled) => {
        boringSetters.setMilkyWayEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'overlay', id: 'milkyWay' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
      },
    },
    filaments: {
      // Same fade-on-toggle pattern as milkyWay: filamentsPass.enabled
      // accepts the boolean OR a non-zero opacity, keeping the pass alive
      // through fade-out.  The boringSetter and fadeTo both wake the
      // scheduler — no extra requestRender.
      setEnabled: (enabled) => {
        boringSetters.setFilamentsEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'filaments' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
      },
      setIntensity: (value) => boringSetters.setFilamentIntensity(value),
    },
    flow: {
      // One patch-shaped entry point over the `settings.flow` slice. The WHOLE
      // patch lands through the copy-on-write store action (React reads via
      // `selectFlow`); the raw intent is stored verbatim — the GPU-safe clamps
      // live in `clampFlowParams` at the flow renderer. Then the per-leaf side
      // effects fire off which keys the patch carried.
      set: (patch) => {
        setFlowAction(settingsStore, patch);
        // Wake the loop so the renderer picks up the new params next frame —
        // the action does NOT wake; fadeTo below wakes on its own, but the
        // knob-only patches (intensity / trail / …) need this explicit nudge.
        state.subsystems.scheduler.requestRender();

        // enabled: re-evaluate demand so the first enable lazy-loads the cube,
        // then fade — but only when the cube is resident. A ready slot implies
        // the commit ran and registered the {kind:'flow'} fade handle, so fadeTo
        // is provably safe. When NOT ready there is nothing drawn to fade AND the
        // handle may be unregistered: a returning user skips the splash and can
        // toggle during the async bootstrap (before wireSlots runs), where fadeTo
        // throws. The FIRST-enable fade-in is owned by the slot commit; this
        // branch handles re-enable + fade-out (the cube stays resident —
        // reevaluateDemand never unloads).
        if (patch.enabled !== undefined) {
          reevaluateDemand(state);
          if (slotReady(state.assetSlots.flow)) {
            void state.subsystems.fades.fadeTo(
              { kind: 'flow' },
              patch.enabled ? 1 : 0,
              patch.enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
            );
          }
        }

        // mode / count both reseed the shared particle buffers.
        if (patch.mode !== undefined || patch.count !== undefined) {
          state.gpu.flowFieldRenderer?.maybeReseed();
        }
      },
    },
    structures: {
      // Two setters, one per independent structure visibility axis. Each writes
      // the authoritative `settings.structures.items[category]` row THROUGH the
      // store (so React's `selectStructureItems` subscriber wakes) and fades the
      // matching FadeRegistry handle.
      setItemEnabled: (category, visible) =>
        setStructureItemEnabled(state, settingsStore, category, visible),
      setLabelEnabled: (category, visible) =>
        setStructureLabelEnabled(state, settingsStore, category, visible),
    },
    volumes: {
      setMasterEnabled: setVolumesEnabled,
      add: addVolumeField,
      remove: removeVolumeField,
      setEnabled: setVolumeFieldEnabled,
      setIntensity: setVolumeFieldIntensity,
      setContrast: setVolumeFieldContrast,
      setDensityScale: setVolumeFieldDensityScale,
      setTrim: setVolumeFieldTrim,
      setExposure: setVolumeFieldExposure,
      setPalette: setVolumeFieldPalette,
      list: listVolumeFields,
      getState: getVolumeFieldsState,
    },
    input: {
      spaceMouse: {
        connect: connectSpaceMouse,
        disconnect: disconnectSpaceMouse,
        isConnected: isSpaceMouseConnected,
        setSensitivity: setSpaceMouseSensitivity,
      },
    },
    // ── Debug sub-handle (observability + dev toggles) ────────
    //
    // `timingService`: a getter, not a copied reference, because initGpu
    // assigns `state.gpu.timingService` AFTER this literal is built — a copy
    // would be null forever.
    //
    // `passOverrides`: DebugPanel hook mutating `state.debug.disabledPasses`.
    // `allNames` is materialised once from HDR_PASSES + UI_PASSES so the
    // React rows track the encoder's pass loop; every `setDisabled` wakes
    // the scheduler so the toggle shows even when idle.
    debug: {
      get timingService() {
        return state.gpu.timingService;
      },
      passOverrides: {
        allNames: [...HDR_PASSES.map((p) => p.name), ...UI_PASSES.map((p) => p.name)],
        isDisabled: (name: string) => state.debug.disabledPasses.has(name),
        setDisabled: (name: string, disabled: boolean) => {
          if (disabled) state.debug.disabledPasses.add(name);
          else state.debug.disabledPasses.delete(name);
          state.subsystems.scheduler.requestRender();
        },
      },
      setShowPickBuffer: (enabled: boolean) => boringSetters.setShowPickBuffer(enabled),
      setShowDiskRadiusRing: (enabled: boolean) => boringSetters.setShowDiskRadiusRing(enabled),
    },

    // The engine-owned settings store. React subscribes via `useStore`; the
    // engine reads it each frame through the `state.settings` getter. Phase 1
    // exposes it alongside the still-live React mirror — Plan 02 migrates
    // consumers and deletes the mirror.
    settingsStore,

    destroy,

    // ── Asset-slot registry (dev-panel surface) ──────────────────────────
    //
    // The same `allSlots` Map the IIFE populates, so the dev panel observes
    // slots as they appear.  Read-only at the type level so React-side
    // mutation trips the typechecker.
    assetSlots: allSlots,
  };

  // Publish the handle so `wireInput`'s onDoubleClick can resolve
  // `handle.focusOn` lazily.  The IIFE may still be in flight, but the
  // handle is non-null well before the user can double-click.
  handleRef.current = handle;

  return handle;
}
