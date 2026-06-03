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
 *   - `galaxyFocusDistance.ts` / `poiFocusDistance.ts` — framing-distance helpers
 *   - `galaxyInfoBuilder.ts`   — buildGalaxyInfo / maxAbsCoord / niceRound
 *   - `cloudLoader.ts`         — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *   - `cameraFraming.ts`       — bbox + FOV → initial camera snapshot
 *   - `seedSettingsCallbacks.ts` — fan-out of default settings to optional cb hooks
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
import { ALL_VISIBLE_MASK, maskHas, maskWith, maskWithout } from '../../utils/sourceMask';
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
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
} from '../../data/defaults';
import type { GalaxyCatalog } from '../../@types/data/GalaxyCatalog';
import type { EngineCallbacks } from '../../@types/engine/EngineCallbacks';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { EngineState } from '../../@types/engine/state/EngineState';
import type { BiasMode } from '../../@types/data/BiasMode';
import type { ScalarCube } from '../../@types/data/ScalarCube';
import type { ScalarFieldPaletteId } from '../../@types/data/ScalarFieldPaletteId';
import type { Tier } from '../../@types/data/Tier';
import type { FamousMetaEntry } from '../../@types/loading/FamousMetaEntry';

import { createTweenManager } from './camera/tweenManager';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createFadeRegistry } from '../animation/fadeRegistry';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../animation/fadeController';
import type { FadeHandle } from '../../@types/animation/FadeHandle';
import { createSelectionSubsystem } from './subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createYouAreHereSubsystem } from './subsystems/youAreHereSubsystem';
import { createLabelDirectorSubsystem } from './subsystems/labelDirectorSubsystem';
import { registerLabelStyleOverrideWake } from './labelStyleOverride';
import { createPoiSubsystem } from './subsystems/poiSubsystem';
import { createClusterFocusSubsystem } from './subsystems/clusterFocusSubsystem';
import { createFpsCounter } from './subsystems/fpsCounter';
import { HDR_PASSES, UI_PASSES } from './frame/passes';
import { buildGalaxyInfo } from './helpers/galaxyInfoBuilder';
import { clearAll } from './helpers/clearAll';
import { commitFocus } from './helpers/commitFocus';
import { commitGalaxyFocus } from './helpers/commitGalaxyFocus';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { isPoi } from './isPoi';
import { logCameraState } from './helpers/logCameraState';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { PgcAliasMap } from '../../@types/loading/PgcAliasMap';
import type { RequestKey } from '../../@types/loading/RequestKey';
import { awaitSlotReady } from '../loading/awaitSlotReady';
import { tierTarget } from '../../data/tierTargets';
import { snapToCameraSnapshot, tweenToCameraSnapshot } from './camera/cameraSnapshot';
import { MILKY_WAY_CENTER_WORLD, MILKY_WAY_VIEW_DISTANCE_MPC } from '../../data/galacticCenter';
import { buildVolumeFieldSettings, seedVolumeFields } from '../../data/volumeFieldDefaults';
import { buildVolumeFieldsSnapshot } from './helpers/buildVolumeFieldsSnapshot';
import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../@types/data/VolumeFieldId';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem lives in `spaceMouseSubsystem.ts`.  Engine-side we
// instantiate it once with `cancelTween` / `onAxes` / `onConnectionChange`
// callbacks and call `applyToCamera()` from `frame()`; the handle's
// connect/disconnect/sensitivity setters forward straight through.
import { createSpaceMouseSubsystem } from './subsystems/spaceMouseSubsystem';
import { buildSettersFromTable } from './wiring/settingsTable';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  loadCompanionAssets,
} from './wiring/galaxyCatalogSourceRegistry';
import type { SettingsTableKey } from '../../@types/settings/SettingsTableKey';
import { runBootstrapPhases } from './phases/bootstrap';
import { rebuildHiResFamousForTier } from './helpers/rebuildHiResFamousForTier';
import type { BootstrapDeps } from '../../@types/engine/BootstrapDeps';
import { createDisabledGpuTimingService } from '../gpu/timing/gpuTimingService';

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

// ── Test-accessible setSourceVisible logic ──────────────────────────────────
//
// `setSourceVisible`'s logic lives at module scope so tests can drive it
// against a partial-state stub without a full GPU engine; the `createEngine`
// closure delegates here.  The `Pick` keeps the signature narrow while still
// accepting the full `EngineState`.
//
// Does NOT trigger loading: it flips `drawMask`/`pickMask` and calls
// `requestRender`.  The render loop's `reevaluateDemand` reads the flipped
// drawMask and loads the now-visible survey (and companions) next frame, so
// visibility and loading stay decoupled.
export async function setSourceVisibleImpl(
  state: Pick<
    import('../../@types/engine/state/EngineState').EngineState,
    'sources' | 'subsystems'
  >,
  opts: { cb: Pick<EngineCallbacks, 'sources'> },
  source: SourceType,
  visible: boolean,
): Promise<void> {
  const { cb } = opts;

  const handle: FadeHandle = { kind: 'survey', source };
  const targetMask = visible
    ? maskWith(state.sources.pickMask, source)
    : maskWithout(state.sources.pickMask, source);
  if (targetMask === state.sources.pickMask && targetMask === state.sources.drawMask) return;

  // pickMask flips IMMEDIATELY — a fading-out layer must not be clickable.
  state.sources.pickMask = targetMask;
  // Notify the UI of the (immediate) state change so the checkbox reflects.
  cb.sources?.onMaskChange?.(targetMask);
  state.subsystems.scheduler.requestRender();

  if (visible) {
    // Flip drawMask, then fade in.  `reevaluateDemand` reads the now-set
    // bit and loads the idle survey (plus companions); the idle-guard keeps
    // a loaded survey from re-fetching, so re-toggling is cheap.
    state.sources.drawMask = targetMask;
    await state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
  } else {
    await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
    // Re-read opacity rather than closing over `visible`: a concurrent
    // off→on toggle within the fade-out window may have reversed the fade.
    // Last-issued fade wins — if a fade-in started while we awaited, opacity
    // is > 0 and we leave the drawMask bit set so the renderer keeps
    // drawing through the ramp-up.
    const finalOpacity = state.subsystems.fades.opacityOf(handle);
    if (finalOpacity === 0) {
      state.sources.drawMask = maskWithout(state.sources.drawMask, source);
    } else {
      state.sources.drawMask = maskWith(state.sources.drawMask, source);
    }
  }
  state.subsystems.scheduler.requestRender();
}

// Test-only alias matching the import name used in tests.
export { setSourceVisibleImpl as setSourceVisibleForTest };

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

  const state: EngineState = {
    // ── Settings — the user-facing SettingsPanel sub-bags ──────────
    //
    // Every settings field lives under a named cluster (point billboard
    // knobs under `points`, HDR controls under `tonemap`, etc.).
    // Defaults flow from `data/defaults.ts`; see
    // `EngineSettingsState.d.ts` for the type-level map.
    settings: {
      points: {
        sizePx: DEFAULT_POINT_SIZE_PX,
        brightness: DEFAULT_BRIGHTNESS,
        depthFade: DEFAULT_DEPTH_FADE_ENABLED,
        highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
        realOnly: DEFAULT_REAL_ONLY_MODE,
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
      // out to the survey's flux limit — bright enough that nearly every
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
      },
      filaments: {
        enabled: SOURCE_REGISTRY[Source.Filaments].visible,
        intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
      },
      volumes: {
        masterEnabled: DEFAULT_VOLUMES_ENABLED,
        // Seeded from the shippable volume registry so each field's on/off
        // bit + tunables EXIST before any cube loads — the demand predicate
        // reads `fields[id]?.enabled` as pure state, symmetric with how
        // `drawMask` seeds survey visibility.  Without it a default-on
        // volume (MCPM) never triggers its initial load.  DEV-only debug
        // fixtures are excluded; SettingsPanel rows still come from the GPU
        // handle list, so seeding adds no premature row.
        fields: seedVolumeFields(),
      },
      // Per-category POI visibility — two independent axes (label-text vs
      // marker-glyph), both default-all-on.  Each record is the source of
      // truth for its axis: a fifth POI category means widening `POI_STYLES`
      // AND adding the row to BOTH records here.
      labelCategoryVisibility: {
        cluster: true,
        supercluster: true,
        famousGalaxy: true,
        void: true,
      },
      debug: {
        showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
        showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      },
      markerCategoryVisibility: {
        cluster: true,
        supercluster: true,
        famousGalaxy: true,
        void: true,
      },
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
      // Two 32-bit bitmasks, one bit per `Source` enum value.
      //
      // pickMask — flipped IMMEDIATELY when the user toggles a survey,
      // so a fading-out layer is not clickable even while still visible.
      //
      // drawMask — flipped AFTER fade-out (or AT the start of fade-in).
      // The renderer iterates `loadedSources()` and skips any whose bit
      // is clear.  Both default to ALL_VISIBLE_MASK so "draw everything
      // that is loaded" holds until the user toggles a single source
      // in the settings panel.
      pickMask: ALL_VISIBLE_MASK,
      drawMask: ALL_VISIBLE_MASK,
      // Mirrors the renderer's per-source GPU buffers in CPU memory so
      // picking can resolve `(source, localIdx)` → GalaxyInfo without a GPU
      // readback per hover.  Empty until the first fetch resolves.
      catalogs: new Map<SourceType, GalaxyCatalog>(),
      // Optional sidecar — `galaxyInfoBuilder` null-checks, so a hover
      // before it lands just renders the generic InfoCard layout.
      famousMeta: [],
      // Bulk cluster/supercluster coverage — null until the slot resolves
      // (and on fetch failure).  The POI merge null-checks, so a boot before
      // it lands shows only the featured anchors.
      clusterBulk: null,
      // Currently-loaded data tier, seeded from `cb.initialTier`; 'medium'
      // is the ~600k-galaxy desktop budget.  `setTier` mutates in place.
      tier: cb.initialTier ?? 'medium',
    },
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
      clusterMarkerRenderer: null,
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
      scalarVolumeRenderer: null,
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
      tweens: createTweenManager(),

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
          // freshly-zeroed axes and lets the loop sleep cleanly.
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
        getCloud: (s) => state.sources.catalogs.get(s),
        getFamousMeta: () => state.sources.famousMeta,
        // Forward-reference: `state.subsystems.pois` is bound later in this
        // literal, but the closure resolves at call time.
        getPoi: (id) => state.subsystems.pois.findPoi(id),
      }),

      // ── Bias-correction subsystem ─────────────────────────────────
      // Owns Malmquist-bias mode flags, cached per-source ratios/weights,
      // and the async bake state machine.  Eager (no GPU dep); the renderer
      // is wired during initGpu via `attachRenderer`.  `handle.setBiasMode`
      // calls into `setMode` here.  Production uses the module-level
      // Vite `?worker` runners; tests inject synchronous stubs.
      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.sources.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── You-are-here subsystem ───────────────────────────────────
      // Owns the "YOU ARE HERE" marker fade-alpha and drives the label +
      // marker-line renderers per frame.  Eager (no GPU dep); the renderers
      // are wired during initGpu via `attachRenderers` after the font-atlas
      // fetch.
      youAreHere: createYouAreHereSubsystem(),

      // ── Label director + POI subsystem ───────────────────────────
      // The director owns the `labelRenderer.setLabels` /
      // `markerLineRenderer.setLines` calls; youAreHere and pois are
      // `LabelProducer`s it polls and merges each frame.  Renderers are
      // wired in during initGpu; producer registration happens just after
      // this literal so the director sees both before the first frame.
      labelDirector: createLabelDirectorSubsystem(),
      pois: createPoiSubsystem({}),

      // ── Cluster focus-mode subsystem ─────────────────────────────
      // Selection-driven: `runFrame` calls `update(selectedPoi, nowMs)` to
      // drive the 400 ms member-isolation fade and threads
      // `produceFocusUniforms` into the points draw.  Eager, no GPU dep.
      clusterFocus: createClusterFocusSubsystem(),

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
      fades: createFadeRegistry(),

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
    // scalarVolumeRenderer) for their commit step, all null until initGpu
    // resolves.  Minting them all in one IIFE pass keeps the lifecycle
    // uniform — even the GPU-handle-free slots (famousMeta, pgcAlias) are
    // born there.
    assetSlots: {
      points: new Map(),
      filaments: null,
      famousMeta: null,
      clusterCatalog: null,
      pgcAlias: null,
      cf4Density: null,
      // Tier-aware (unlike cf4Density): setTier reloads on tier change.
      mcpm: null,
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
  // Registration order = merged label order (youAreHere first, POIs after).
  // Both are eager in the state literal, so this is synchronous before any
  // frame fires.  Register both even when POIs are empty — the director
  // treats an empty contribution as a no-op.  Structural typing carries it:
  // `YouAreHereSubsystem` aliases `LabelProducer`, `PoiSubsystem` extends it.
  state.subsystems.labelDirector.registerProducer(state.subsystems.youAreHere);
  state.subsystems.labelDirector.registerProducer(state.subsystems.pois);

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
  const boringSetters = buildSettersFromTable(state, cb, () =>
    state.subsystems.scheduler.requestRender(),
  ) satisfies Record<SettingsTableKey, (value: unknown) => void>;

  // ── Bespoke methods (don't fit the settingsTable shape) ────────────
  //
  // Each owns work the descriptor table can't express: async worker bakes,
  // per-source slot reloads, subsystem forwards, multi-field mutations, or
  // returning live state.  Declared up-front so the sub-handle literal can
  // reference each by name — no forward references, no `!` assertions.

  function clearSelection(): void {
    // Unified teardown — clears galaxy/POI selection AND the focus slot
    // (so the cluster-focus fade collapses) in one call.  The branching
    // + render-scheduling lives in `clearAll` so the engine.ts closure
    // stays a thin wrapper.  See clearAll.ts for the dismiss-vs-deselect
    // rationale and the order-of-firing guarantee.
    clearAll(state);
  }

  function setBiasMode(mode: BiasMode): void {
    // Shader branches on the integer mode (0 = none, 1 = volume-limited, …),
    // so flipping it takes effect next frame with no pipeline rebuild.  We
    // always fire the echo (even when unchanged) so the UI seeds on first
    // call.  Routes through `biasCorrectionSubsystem`, which owns the cached
    // ratios/weights + worker runners and calls requestRender itself as each
    // per-source splice resolves, so visuals update progressively.  The
    // `void` discards the Promise — engine.ts doesn't await.
    state.settings.bias.mode = mode;
    cb.bias?.onModeChange?.(mode);
    void state.subsystems.biasCorrection.setMode(mode);
    state.subsystems.scheduler.requestRender();
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
    // bootstrap would set `#focus=…` while the camera stays put.  The POI
    // branch skips the guard so deep-link drains can land POI state
    // pre-camera (see commitPoiFocus).
    if (!isPoi(target) && !state.cam) return;
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
    const cloud = state.sources.catalogs.get(Source.Famous);
    if (!cloud) return;
    const localIdx = state.sources.famousMeta.findIndex((m) => m.id === id);
    if (localIdx < 0) return;

    // Build the GalaxyInfo the picker would, from live sidecars.
    const info = buildGalaxyInfo(cloud, localIdx, Source.Famous, state.sources.famousMeta);
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
    const cloud = state.sources.catalogs.get(source);
    if (!cloud) return;
    if (localIdx < 0 || localIdx >= cloud.count) return;

    // Caller-supplied `famousMeta` wins over the engine's copy — see the
    // EngineHandle JSDoc for the race this defends against.
    const info = buildGalaxyInfo(cloud, localIdx, source, famousMeta ?? state.sources.famousMeta);
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

  async function setSourceVisible(source: SourceType, visible: boolean): Promise<void> {
    // Delegate to the module-scope helper (testable without a GPU engine).
    return setSourceVisibleImpl(state, { cb }, source, visible);
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
    return state.sources.catalogs.get(source);
  }

  function getCloudObjIds(source: SourceType): BigUint64Array | undefined {
    return state.sources.catalogs.get(source)?.objIDs;
  }

  function setVolumesEnabled(enabled: boolean): void {
    // Master toggle — mutate the settings bag so the per-frame volume gates
    // see it next frame.  No echo callback: the React layer owns this value
    // optimistically.
    state.settings.volumes.masterEnabled = enabled;
    // Drive the FadeRegistry on the volumesMaster handle.  The encodeHdr*
    // sites multiply this master opacity into every per-field fade, so the
    // whole subsystem ramps in lockstep.  The pass-enabled gate accepts
    // masterEnabled OR opacity > 0, so it keeps blitting through fade-out.
    void state.subsystems.fades.fadeTo(
      { kind: 'volumesMaster' },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    state.subsystems.scheduler.requestRender();
  }

  function addVolumeField(fieldId: VolumeFieldId, cube: ScalarCube): void {
    // Upload to the renderer; a silent no-op if it isn't ready yet (re-add
    // once booted).
    state.gpu.scalarVolumeRenderer?.addField(fieldId, cube);
    // Seed the per-field settings entry from registry defaults if absent —
    // re-registering preserves previously-tuned values.  Shippable volumes
    // already have a construction seed, so the guard only matters for a
    // dynamically-added handle.
    if (!state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId] = buildVolumeFieldSettings(fieldId);
    }
    // Forward the current per-field tunables into the renderer so the
    // new upload inherits whatever the user set before re-registering.
    const persisted = state.settings.volumes.fields[fieldId]!;
    state.gpu.scalarVolumeRenderer?.setIntensity(fieldId, persisted.intensity);
    state.gpu.scalarVolumeRenderer?.setEnabled(fieldId, persisted.enabled);
    state.gpu.scalarVolumeRenderer?.setContrast(fieldId, persisted.contrast);
    state.gpu.scalarVolumeRenderer?.setDensityScale(fieldId, persisted.densityScale);
    state.gpu.scalarVolumeRenderer?.setFieldPalette(fieldId, persisted.paletteId);
    state.gpu.scalarVolumeRenderer?.setTrim(fieldId, persisted.trim);
    state.gpu.scalarVolumeRenderer?.setExposure(fieldId, persisted.exposure);
    // Drive the FadeRegistry from the persisted enable bit: enabled → fade
    // to 1; disabled → leave it at the 0 set by onFieldAdded (the draw
    // loop's `(!enabled && opacity <= 0)` skip keeps it invisible until the
    // user toggles it on).
    if (persisted.enabled) {
      void state.subsystems.fades.fadeTo(
        { kind: 'scalarField', field: fieldId },
        1,
        FADE_IN_DURATION_MS,
      );
    }
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function removeVolumeField(fieldId: VolumeFieldId): void {
    state.gpu.scalarVolumeRenderer?.removeField(fieldId);
    delete state.settings.volumes.fields[fieldId];
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  /**
   * Lazy-load the DEV-only debug volume slot backing a field if it's `idle`.
   * The shippable volumes (CF-4, MCPM) load via `reevaluateDemand` instead
   * (their demand reads `fields[id].enabled`); the debug fixtures are
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
        slot.load({ handle: fieldId, shape, dims: 64, boxSizeMpc: 400 });
        return;
      }
    }
  }

  function setVolumeFieldEnabled(fieldId: VolumeFieldId, enabled: boolean): void {
    // Flip the settings flag: the cf4/mcpm demand predicate reads
    // `fields[id].enabled`, so `reevaluateDemand` loads them on flip-on
    // (idle-guarded against re-fetch).  The DEV debug fixtures aren't demand
    // rows, so they keep a direct lazy load here — a no-op for cf4/mcpm ids,
    // so the two paths partition cleanly.
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].enabled = enabled;
    }
    if (enabled) maybeLazyLoadDebugVolume(fieldId);
    state.gpu.scalarVolumeRenderer?.setEnabled(fieldId, enabled);
    // Drive the FadeRegistry alongside the renderer flip; the draw loop's
    // `(!enabled && opacity <= 0)` skip keeps it rendering through fade-out.
    void state.subsystems.fades.fadeTo(
      { kind: 'scalarField', field: fieldId },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldIntensity(fieldId: VolumeFieldId, intensity: number): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].intensity = intensity;
    }
    state.gpu.scalarVolumeRenderer?.setIntensity(fieldId, intensity);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldContrast(fieldId: VolumeFieldId, contrast: number): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].contrast = contrast;
    }
    state.gpu.scalarVolumeRenderer?.setContrast(fieldId, contrast);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldDensityScale(fieldId: VolumeFieldId, value: number): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].densityScale = value;
    }
    state.gpu.scalarVolumeRenderer?.setDensityScale(fieldId, value);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldTrim(fieldId: VolumeFieldId, trim: number): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].trim = trim;
    }
    state.gpu.scalarVolumeRenderer?.setTrim(fieldId, trim);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldExposure(fieldId: VolumeFieldId, exposure: number): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].exposure = exposure;
    }
    state.gpu.scalarVolumeRenderer?.setExposure(fieldId, exposure);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function setVolumeFieldPalette(fieldId: VolumeFieldId, id: ScalarFieldPaletteId): void {
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].paletteId = id;
    }
    state.gpu.scalarVolumeRenderer?.setFieldPalette(fieldId, id);
    cb.volumes?.onFieldsChanged?.(buildVolumeFieldsSnapshot(state));
    state.subsystems.scheduler.requestRender();
  }

  function listVolumeFields(): VolumeFieldId[] {
    return (state.gpu.scalarVolumeRenderer?.listHandles() ?? []) as VolumeFieldId[];
  }

  function getVolumeFieldsState(): ReadonlyArray<VolumeFieldRowData> {
    return buildVolumeFieldsSnapshot(state);
  }

  async function connectSpaceMouse(): Promise<boolean> {
    const result = await state.subsystems.spaceMouse.connect();
    return result.ok;
  }

  function disconnectSpaceMouse(): void {
    state.subsystems.spaceMouse.disconnect();
    state.subsystems.scheduler.requestRender();
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
    state.subsystems.pois.destroy();
    state.subsystems.clusterFocus.destroy();
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
    state.gpu.clusterMarkerRenderer?.destroy();
    state.gpu.clusterMarkerRenderer = null;
    state.gpu.texturedDiskRenderer?.destroy();
    state.gpu.texturedDiskRenderer = null;
    state.gpu.proceduralDiskRenderer?.destroy();
    state.gpu.proceduralDiskRenderer = null;
    state.gpu.milkyWayRenderer?.destroy();
    state.gpu.milkyWayRenderer = null;
    state.gpu.horizonShellRenderer?.destroy();
    state.gpu.horizonShellRenderer = null;
    state.gpu.scalarVolumeRenderer?.destroy();
    state.gpu.scalarVolumeRenderer = null;
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
    state.sources.catalogs.clear();
    state.cam = null;
  }

  // ── Handle literal — sub-handle clusters + destroy + slots ──
  //
  // Each sub-handle is a thin forwarder onto a local function or a
  // `boringSetters` entry.  This literal is the only public surface.
  const handle: EngineHandle = {
    points: {
      setSize: (sizePx) => boringSetters.setPointSize(sizePx),
      setBrightness: (value) => boringSetters.setBrightness(value),
      setDepthFade: (enabled) => boringSetters.setDepthFadeEnabled(enabled),
      setHighlightFallback: (enabled) => boringSetters.setHighlightFallback(enabled),
      setRealOnly: (enabled) => boringSetters.setRealOnlyMode(enabled),
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
      // the gate keeps the pass alive through fade-out.
      setEnabled: (enabled) => {
        boringSetters.setMilkyWayEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'overlay', id: 'milkyWay' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
        state.subsystems.scheduler.requestRender();
      },
    },
    filaments: {
      // Same fade-on-toggle pattern as milkyWay: filamentsPass.enabled
      // accepts the boolean OR a non-zero opacity, keeping the pass alive
      // through fade-out.
      setEnabled: (enabled) => {
        boringSetters.setFilamentsEnabled(enabled);
        void state.subsystems.fades.fadeTo(
          { kind: 'filaments' },
          enabled ? 1 : 0,
          enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
        );
        state.subsystems.scheduler.requestRender();
      },
      setIntensity: (value) => boringSetters.setFilamentIntensity(value),
    },
    labels: {
      // Two parallel setters, one per independent axis.  Both forward into
      // the POI subsystem (the canonical record), mirror into
      // `state.settings`, then echo a fresh copy as an immutable snapshot.
      // The OTHER axis is never touched — see `poiSubsystem.ts` for the
      // orthogonality rationale.
      setCategoryLabelVisible: (category, visible) => {
        state.subsystems.pois.setCategoryLabelVisible(category, visible);
        state.settings.labelCategoryVisibility = {
          ...state.settings.labelCategoryVisibility,
          [category]: visible,
        };
        cb.labels?.onLabelCategoryVisibilityChange?.({
          ...state.settings.labelCategoryVisibility,
        });
        state.subsystems.scheduler.requestRender();
      },
      setCategoryMarkerVisible: (category, visible) => {
        state.subsystems.pois.setCategoryMarkerVisible(category, visible);
        state.settings.markerCategoryVisibility = {
          ...state.settings.markerCategoryVisibility,
          [category]: visible,
        };
        cb.labels?.onMarkerCategoryVisibilityChange?.({
          ...state.settings.markerCategoryVisibility,
        });
        state.subsystems.scheduler.requestRender();
      },
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
