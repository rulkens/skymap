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
 *   Bootstrap phases (post-Phase-5; lift the ~1100-line async IIFE):
 *   - `phases/initGpu.ts`      — device + every renderer + point-source slots
 *   - `phases/wireSlots.ts`    — sidecar slots + thumbnails + parallel load
 *   - `phases/wireInput.ts`    — pickRenderer + camera + orbit-controls + click
 *   - `phases/startLoop.ts`    — RunFrameDeps assembly + first requestRender
 *   - `phases/bootstrap.ts`    — orchestrator + BootstrapDeps + Phase signature
 *
 * Hover/select state lives in `state.subsystems.selection` (Spec D.3
 * extracted the four inline helpers — `setHovered` / `setSelected` /
 * `selectionEq` / `galaxyInfoForSelection` — into the closure-returning
 * factory `selectionSubsystem.ts`).  The public handle and the
 * forward-declared `frameRef` / `detachControlsRef` / `handleRef` boxes
 * stay inline here because they're written by the bootstrap phases via
 * the `{current}` ref pattern (the bootstrap modules are siblings, not
 * parents).
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
// The whole subsystem (WebHID device handle, axes-cache, dt-baseline,
// sensitivity scalar, per-frame camera mutation) lives in
// `spaceMouseSubsystem.ts`.  Engine-side we just instantiate it once,
// pass it `cancelTween` / `onAxes` / `onConnectionChange` callbacks,
// and call `applyToCamera()` from `frame()`.  The handle's
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
// The business logic of `setSourceVisible` is extracted to a module-scope
// async function so that tests can invoke it directly against a partial-state
// stub without instantiating a full GPU engine. The closure inside
// `createEngine` delegates straight here.
//
// The state parameter uses an intersection-typed pick so the function
// signature stays narrow (only the fields it reads) while accepting the full
// `EngineState` from production callers. This function does NOT trigger
// loading: it flips `drawMask`/`pickMask` and calls `requestRender`. The
// per-frame `reevaluateDemand` in the render loop reads the flipped drawMask
// and loads the now-visible survey (and its companions) on the next frame —
// so visibility and loading stay decoupled, and a narrow state view suffices.
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
    // Flip drawMask, then fade in. The per-frame `reevaluateDemand` reads the
    // now-set bit and loads the idle survey (plus companions like famousMeta,
    // which demands on the survey slot leaving `idle`); the idle-guard keeps
    // an already-loaded survey from re-fetching, so re-toggling is cheap. The
    // requestRender above already woke the loop, so the load starts on the
    // next frame.
    state.sources.drawMask = targetMask;
    await state.subsystems.fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
  } else {
    await state.subsystems.fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
    // Re-read opacity rather than closing over `visible`, because a
    // concurrent toggle may have reversed the fade by the time we
    // resume here (off→on within the 100ms fade-out window). The
    // last-issued fade wins: if a fade-in started while we were
    // awaiting fade-out, opacityOf returns > 0 and we leave the
    // drawMask bit set so the renderer keeps drawing through the
    // ramp-up. The promise we awaited is the OLDER fade's settle —
    // by the time it resolves, the registry's current target is
    // whatever the newer call set, not 0.
    const finalOpacity = state.subsystems.fades.opacityOf(handle);
    if (finalOpacity === 0) {
      state.sources.drawMask = maskWithout(state.sources.drawMask, source);
    } else {
      state.sources.drawMask = maskWith(state.sources.drawMask, source);
    }
  }
  state.subsystems.scheduler.requestRender();
}

// Test-only alias. The implementation lives at module scope as
// `setSourceVisibleImpl` so it's directly testable; this re-export
// matches the import name used in tests written before the rename.
export { setSourceVisibleImpl as setSourceVisibleForTest };

export function createEngine(canvas: HTMLCanvasElement, cb: EngineCallbacks): EngineHandle {
  // ── Mutable engine state ─────────────────────────────────────────────────
  //
  // Everything lives as closure variables rather than a class because the
  // engine is a singleton: one canvas → one engine → one set of state.
  // Closure variables are slightly simpler to reason about than `this.*` and
  // they keep the internal state completely inaccessible from outside.

  // The whole engine state — see `@types/EngineState.d.ts` (and the
  // per-sub-bag `.d.ts` siblings) for the type-level map of every field,
  // with per-bag rationale.  Sub-bag groupings:
  //
  //   - `settings`   → SettingsPanel-surfaced knobs (initial values
  //                    seeded from `data/defaults.ts`, the single
  //                    source of truth shared with App.tsx so the
  //                    panel doesn't flash a stale value before the
  //                    first echo callback fires).
  //   - `bias`       → Malmquist-bias bake outputs (apparentMagLimit +
  //                    two Schechter parameters; all three stay 0 until
  //                    the shader's mode-2/3/4 branches activate via the
  //                    `setBiasMode` lazy bake forwarded to
  //                    `state.subsystems.biasCorrection.setMode`).  The
  //                    user-facing knobs (mode + absMagLimit) live on
  //                    `state.settings.bias`.
  //   - `sources`    → loaded `GalaxyCatalog`s + visibility bitmask +
  //                    LOD mode + the optional famous-galaxy sidecars.
  //   - `picking`    → hover / click / drag mutables (latest CSS-pixel
  //                    mouse position, in-flight pick guard, drag flag).
  //   - `gpu`        → renderer / pickRenderer / HDR target /
  //                    tone-map pass — all null until the async IIFE
  //                    finishes `initGpu`.
  //   - `subsystems` → owned long-lived helpers; `tweens`/`spaceMouse`
  //                    construct up-front, the rest land later.
  //   - `cam` / `initialCamSnapshot` → orbit camera + framing snapshot,
  //                                both null until the first cloud
  //                                loads.
  //
  // The outer `state` binding is `const` because the closure never
  // reassigns it — only the inner fields mutate.  Mutation in place
  // matches how the subsystem facades already manage their own state
  // and avoids per-frame allocations on the hot path.

  // ── Frame-function forward declaration ────────────────────────────────────
  //
  // The render loop's `frame()` body lives in `runFrame.ts`, called
  // from the `startLoop` bootstrap phase, because it reads GPU
  // resources (device, context, texturedQuadRenderer, texturedDiskRenderer) that
  // initGpu() returns asynchronously.  But the `RenderScheduler` we
  // wire into `state.subsystems.scheduler` needs an `onFrame` callback
  // at construction time — which is *here*, in the synchronous state
  // literal below.
  //
  // We resolve the chicken-and-egg by forward-declaring `frameRef` as a
  // `{ current }` ref initialised to a no-op stub.  The state literal's
  // scheduler captures `frameRef` (via the `() => frameRef.current()`
  // closure) rather than the stub's current value, so when the
  // `startLoop` phase later assigns `frameRef.current = () => { /* real
  // body */ }`, every subsequent rAF invocation runs the real body.
  //
  // Why a ref (not a `let`)?  The bootstrap phases live in sibling
  // modules (`phases/startLoop.ts`); a `let` would be invisible across
  // the module boundary.  The ref-box round-trip is the same pattern
  // Phase 3's `lastReportedFps` introduced for `runFrame.ts`'s closure
  // captures — see `phases/bootstrap.ts`'s `BootstrapDeps` for the
  // full inventory of refs threaded through.
  //
  // The stub is silently a no-op rather than a logging warning
  // because its only invocation window is "rAF fires before
  // `startLoop` finishes wiring `frameRef.current`" — vanishingly rare
  // (the user would have to interact with the canvas in the first
  // ~milliseconds of startup), and harmless even if it does fire.
  const frameRef: { current: () => void } = {
    current: () => {
      /* stub until startLoop assigns the real body — see comment above */
    },
  };

  // ── Rolling FPS counter ────────────────────────────────────────────────────
  //
  // Lives at engine scope so the same instance accumulates samples across
  // every frame() invocation (a counter inside frame() would reset on each
  // call).  The counter itself is a thin closure over a 60-frame ring buffer
  // — see fpsCounter.ts for the why-rolling-window rationale.
  //
  // We track `lastReportedFps` here too so we can throttle the callback
  // fan-out: integer fps values change at most once per ~16 ms in the worst
  // case (60 → 59 → 60 oscillation under noise), but in practice a steady
  // framerate produces just one initial fire and then silence — far cheaper
  // than every-N-frames polling, which would burn React renders even when
  // the number was unchanged.  Per-change is the lighter option.
  const fpsCounter = createFpsCounter(60);
  // Boxed as `{current}` so the frame body in `runFrame.ts` can write
  // to it across the module boundary — see runFrame.ts's module header
  // for the {current} ref pattern.
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
      // Bias's user-tunable subset.  The bake-derived fields
      // (apparentMagLimit / schechterMStar / schechterAlpha) stay on
      // `state.bias` — they're worker outputs, not settings.  Why -19
      // as the volume-limited default?  It's roughly the absolute
      // magnitude where the SDSS spectroscopic main sample is
      // volume-complete out to the survey's flux limit — bright enough
      // that almost every catalog galaxy meeting it has a measured
      // spectrum, dim enough that we still see plenty of structure.
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
        // Seeded from the shippable volume registry entries so each
        // field's on/off bit + tunables EXIST before any cube loads —
        // the demand predicate reads `fields[id]?.enabled` as pure
        // state, fully symmetric with how `drawMask` seeds survey
        // visibility.  Without this, a default-on volume (MCPM) never
        // triggers its initial demand-driven load.  DEV-only debug
        // fixtures are excluded (no on-disk payload).  SettingsPanel
        // rows still come from the GPU handle list (loaded fields only),
        // so seeding here adds no premature row.
        fields: seedVolumeFields(),
      },
      // Per-category POI visibility — two independent axes (label-text vs
      // marker-glyph).  Both default to every category visible so the
      // labelDirector emits every cluster / supercluster / famous galaxy /
      // void on first paint AND `clusterMarkerRenderer` draws every ring +
      // halo.  Each record is the single source of truth for its axis —
      // adding a fifth POI category means widening `POI_STYLES` in
      // `poiSubsystem` AND adding the row to BOTH records here.
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
      // Bake-only sentinels — overwritten before the shader's
      // mode-2/3/4 branches are reachable.  See `setBiasMode` for the
      // lazy worker bake.  The user-tunable mode + absMagLimit live
      // on `state.settings.bias`.
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
      // Mirrors the renderer's per-source GPU buffers in CPU memory
      // so picking can resolve `(source, localIdx)` into a GalaxyInfo
      // without a GPU readback for every hover.  Empty until the
      // first parallel fetch resolves.
      catalogs: new Map<SourceType, GalaxyCatalog>(),
      // Optional sidecar — `galaxyInfoBuilder` null-checks, so a hover
      // firing before it lands just renders the generic InfoCard layout.
      famousMeta: [],
      // Bulk cluster/supercluster coverage — null until the cluster-catalog
      // slot resolves (and stays null on fetch failure). The POI merge
      // null-checks, so a boot before it lands shows only the featured anchors.
      clusterBulk: null,
      // Currently-loaded data tier.  Seeded from `cb.initialTier` (Task 5
      // of the data-tiers plan); the default of 'medium' matches the
      // pre-tier ~600k-galaxy desktop budget.  `setTier` mutates this in
      // place before kicking off per-source reloads.
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
      // Canonical fade + source bind-group layouts. Built once in
      // initGpu and threaded into every renderer's createPipelineLayout
      // so every consumer's bind groups share one layout identity. See
      // services/gpu/bindGroupLayouts/fadeUniforms.ts for the rationale
      // (layout:'auto' cross-pipeline trap).
      fadeBgl: null,
      sourceBgl: null,
      postProcess: null,
      volumeOffscreen: null,
      filamentRenderer: null,
      // labelRenderer + markerLineRenderer: null until initGpu completes
      // the loadFontAtlas() fetch and constructs both renderers.  They're
      // excluded from the isEngineReady predicate (same rationale as
      // filamentRenderer — optional async resources, null-checked at
      // point of use by labelsPass / markerLinesPass).
      labelRenderer: null,
      markerLineRenderer: null,
      // selectionRingRenderer: null until initGpu constructs it.
      // Excluded from isEngineReady — null-checked at point of use by
      // selectionRingPass.
      selectionRingRenderer: null,
      // clusterMarkerRenderer: null until initGpu constructs it
      // (cluster-viz sub-plan 2 task 13).  Excluded from
      // isEngineReady — null-checked at point of use by the
      // cluster-marker frame pass (task 14).
      clusterMarkerRenderer: null,
      // texturedDiskRenderer / proceduralDiskRenderer / milkyWayRenderer:
      // null until initGpu constructs them.  These don't gate any
      // frame-loop logic via state.gpu — the frame body reads them through
      // RunFrameDeps (assembled in `phases/startLoop.ts`).  They live
      // here so `destroy()` below has a reachable reference to release
      // each renderer's GPU buffers, AND so later bootstrap phases
      // (`wireSlots`, `startLoop`) consume the same identities by
      // reading `state.gpu.X` directly.  See `EngineGpuHandles.d.ts`
      // for the full reachability story.
      texturedDiskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      horizonShellRenderer: null,
      // Constructed during initGpu, null until then.  Excluded from the
      // isEngineReady predicate — the volumeUpsamplePass null-checks
      // both handles before calling hasActiveFields(), so a null state
      // is a silent no-op.
      scalarVolumeRenderer: null,
      // Constructed alongside scalarVolumeRenderer in initGpu; null until
      // then.  Excluded from the isEngineReady predicate — the
      // volumeUpsamplePass null-checks this field at point of use.
      volumeUpsample: null,
      // Pick-buffer debug overlay.  Constructed in initGpu; null until
      // then.  Excluded from the isEngineReady predicate — the per-
      // frame consumer null-checks the handle together with the
      // 'settings.debug.showPickBuffer' toggle.
      pickDebugOverlay: null,
      // Disk-radius debug ring.  Constructed in initGpu; null until
      // then.  Excluded from isEngineReady — the per-frame pass
      // null-checks the handle together with the
      // 'settings.debug.showDiskRadiusRing' toggle.
      diskRadiusRing: null,
      // Per-pass GPU timing service.  Always non-null — initialized
      // here with a no-op stub (no GPU resources), then replaced by
      // initGpu with the device-aware service after the device is
      // acquired.  Consumers gate work behind `.enabled`.  Destroy
      // calls into the live slot symmetrically with the renderers.
      timingService: createDisabledGpuTimingService(),
    },
    subsystems: {
      // ── LOD-1 / LOD-2 / LOD-3 impostor planners + atlas ─────────
      // All null until `wireSlots` constructs them post-GPU init.
      // The hi-res pair (LOD-3) is rebuilt per-tier so the underlying
      // `texture_2d_array`'s `layerSide` always matches the active tier;
      // the others persist across tier changes.
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
      // All puck state (axes cache, dt baseline, sensitivity, lazy
      // WebHID handle) lives inside the subsystem.  We hand it three
      // callbacks: cancelTween (yields the focus tween to user
      // input), onConnectionChange (UI indicator), onAxes (wakes the
      // render loop so the next frame applies the new axes).
      spaceMouse: createSpaceMouseSubsystem({
        cancelTween: () => state.subsystems.tweens.cancel(),
        onConnectionChange: (connected) => {
          // The subsystem is the single site that fires the connected-change
          // echo for both connect + disconnect; the handle methods don't
          // echo directly — the subsystem's lifecycle owns the truth and
          // pushes it back out via this callback.
          cb.input?.spaceMouse?.onConnectedChange?.(connected);
          // Wake one frame so the still-animating predicate sees
          // the freshly-zeroed axes (the subsystem clears them on
          // disconnect) and lets the loop sleep cleanly.
          state.subsystems.scheduler.requestRender();
        },
        onAxes: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── Selection subsystem ──────────────────────────────────────
      // Owns the user-facing hover / select state and fans out
      // `cb.onHoverChange` / `cb.onSelectChange` only on actual
      // change.  Constructed eagerly here (no GPU dep) so the public
      // handle's `clearSelection` / `selectFamous` / `selectByAlias`
      // can call into it from t=0 without a null-check.  Cloud +
      // sidecar accessors are passed as closures (not snapshots) so
      // the subsystem reads the LIVE map at call time — see the
      // module header for why that matters across tier swaps and the
      // pre-GPU-upload race window.
      selection: createSelectionSubsystem({
        cb,
        getCloud: (s) => state.sources.catalogs.get(s),
        getFamousMeta: () => state.sources.famousMeta,
        // Forward-reference: `state.subsystems.pois` is bound later in
        // this same literal but the closure resolves at call time,
        // long after the literal completes.  Mirrors the cloud/famous
        // accessors above.
        getPoi: (id) => state.subsystems.pois.findPoi(id),
      }),

      // ── Bias-correction subsystem ─────────────────────────────────
      // Owns Malmquist-bias mode flags, cached per-source ratios /
      // weights, and the async bake state machine.  Constructed eagerly
      // here (no GPU dep); the renderer is wired during `phases/initGpu`
      // via `attachRenderer(...)`.  `handle.setBiasMode` calls into
      // `setMode` on this subsystem.
      //
      // No `schechterRunner` / `angularRunner` overrides — the
      // module-level defaults (Vite `?worker` runners on this same
      // subsystem module) take over in production; tests inject
      // synchronous stubs at the test factory call site.
      biasCorrection: createBiasCorrectionSubsystem({
        getMode: () => state.settings.bias.mode,
        getLoadedClouds: () => state.sources.catalogs,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      }),

      // ── You-are-here subsystem ───────────────────────────────────
      // Owns the "YOU ARE HERE" marker fade-alpha state and drives
      // labelRenderer + markerLineRenderer per frame.  Constructed
      // eagerly here (no GPU dep); the two renderers are wired in
      // during `phases/initGpu.ts` via `attachRenderers(...)` after
      // the `loadFontAtlas()` fetch completes.
      youAreHere: createYouAreHereSubsystem(),

      // ── Label director + POI subsystem ───────────────────────────
      //
      // The director owns the actual `labelRenderer.setLabels` /
      // `markerLineRenderer.setLines` calls — youAreHere and pois are
      // both `LabelProducer`s that the director polls and merges each
      // frame.  Renderers are wired in during `initGpu` via the
      // director's `attachRenderers(...)`; producer registration
      // happens right after this state literal (see below) so the
      // director sees both producers before the first frame fires.
      labelDirector: createLabelDirectorSubsystem(),
      pois: createPoiSubsystem({}),

      // ── Render scheduler — eager, capture-safe ────────────────────
      //
      // The real scheduler is created right here in the state literal,
      // *not* via a deferred shim swap.  Its `onFrame` callback closes
      // over the forward-declared `frame` binding above; the IIFE
      // assigns the real frame body before any rAF can fire.  See the
      // forward declaration's docstring for the full rationale.
      //
      // Anyone who captures `state.subsystems.scheduler` from this
      // moment onward gets the live scheduler — no shim, no proxy,
      // no post-init reassignment.  Capturing a deferred shim by
      // reference would break hover-pick on first frames.
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // ── Fade registry ──────────────────────────────────────────
      //
      // Constructed eagerly so renderer construction in `initGpu`
      // can register handles without a null-check. The registry is
      // pure CPU — no GPU device needed at construction time.
      fades: createFadeRegistry(),

      // The remaining subsystems land later in the IIFE once their
      // dependencies (GPU device, pickRenderer, scheduler) exist.
      clickResolver: null,
      inputBindings: null,
      // Aggregator for download-progress events — instantiated inside
      // the GPU init IIFE before the first `loadAllClouds` call so
      // `cb.onLoadProgress` is the closure target.  See the IIFE.
      loadProgress: null,
    },
    cam: null,
    initialCamSnapshot: null,
    // ── Asset-loading slot bag ───────────────────────────────────────────
    //
    // The slot machinery (see `services/loading/AssetSlot.ts`) is a
    // race-checked fetch→commit pipeline.  We declare the Map up-front so
    // consumers can call `state.assetSlots.points.get(source)?.load(...)`
    // without a null check, but the actual slots are constructed inside
    // the GPU init IIFE — they close over `state.gpu.renderer` for their
    // commit step, and that handle is null until `initGpu` resolves.
    //
    // Eager construction inside the IIFE keeps every slot's birth and
    // its renderer-handle in the same lexical scope; a lazy-on-first-load
    // alternative would split wiring across engine + setTier helper.
    assetSlots: {
      points: new Map(),
      // Filament slot is minted inside the GPU init IIFE — it commits to
      // `state.gpu.filamentRenderer`, which is null until then.  Null
      // initial mirrors the `state.gpu.renderer = null` lifecycle.
      filaments: null,
      // Famous + PGC-alias slots have no GPU handles to wait for, but we
      // still construct them inside the IIFE alongside the rest of the
      // slot bag so every `state.assetSlots.*` field has the same birth
      // site.  Keeps the lifecycle story uniform: "all slots are minted
      // in one place, by one IIFE pass".
      famousMeta: null,
      // Cluster/supercluster coverage slot — same null-then-set lifecycle as
      // famousMeta. Minted inside the GPU init IIFE alongside the other slots.
      clusterCatalog: null,
      pgcAlias: null,
      // CF-4 DM density slot — minted inside the GPU init IIFE alongside
      // the filament slot.  Same null-then-set lifecycle: the slot's
      // commit registers a field on `state.gpu.scalarVolumeRenderer`,
      // which is null until the IIFE constructs it.
      cf4Density: null,
      // MCPM Cosmic Web slot — same null-then-set lifecycle as cf4Density.
      // Tier-aware: setTier reloads on tier change.  See loading/slots/mcpmSlot.ts.
      mcpm: null,
    },
    // ── One-shot transient request flags ────────────────────────────────
    //
    // Edge-triggered UI events that drive demand predicates (palette
    // opened, lazy alias requested) but have no persistent settings or
    // loaded-data home.  Empty at boot; the wiring layer sets a key in
    // response to a discrete event and leaves it set — the demand loop's
    // idle-guard keeps the triggered slot from re-fetching, so no clear is
    // needed.  See `@types/loading/RequestKey.d.ts`.
    requests: new Set<RequestKey>(),
    // ── Debug-only per-frame skip flags ─────────────────────────────────
    //
    // The DebugPanel's `RenderTogglesSection` mutates this set via the
    // `passOverrides` sub-handle so a developer can flip individual
    // renderer passes off to visually distinguish overlapping draws.
    // Empty in production — every encoder helper pays one `Set.has` per
    // pass per frame, which is in the noise next to the GPU dispatch.
    debug: { disabledPasses: new Set<string>() },
  };

  // ── Register label producers with the director ───────────────────────
  //
  // Order of registration = order in the merged label list (youAreHere
  // first, POIs after).  Both producers are constructed eagerly in the
  // state literal above, so this runs synchronously before any frame can
  // fire.  We deliberately register both even when the POI subsystem is
  // empty — the director treats an empty contribution as a no-op.
  //
  // Structural typing carries the assignment: `YouAreHereSubsystem` is
  // an alias for `LabelProducer`, and `PoiSubsystem` extends it.
  state.subsystems.labelDirector.registerProducer(state.subsystems.youAreHere);
  state.subsystems.labelDirector.registerProducer(state.subsystems.pois);

  // ── Wake on label-style override edits ────────────────────────────────
  //
  // The DebugPanel's LabelEffectsSection writes to `labelStyleOverride`,
  // which bumps a version counter that the label director reads from its
  // signature hash.  But render-on-demand only consults that hash inside
  // an active frame — slider edits at idle would sit invisible until the
  // user nudged the camera.  Registering scheduler.requestRender here
  // closes the loop: every set/clear wakes the loop on the next tick.
  registerLabelStyleOverrideWake(() => state.subsystems.scheduler.requestRender());

  // ── Cleanup function returned by `attachOrbitControls` ─────────────────
  // Orbit-controls attachment lives outside `inputBindings` because it
  // needs a fully-constructed OrbitCamera which doesn't exist at
  // engine() time — see inputBindings.ts's docstring.  This handle is
  // a transient local rather than engine state because it's a single
  // teardown function with no other consumers.
  //
  // Boxed as `{current}` because `attachOrbitControls` runs inside the
  // `wireInput` bootstrap phase (a sibling module), so the assignment
  // crosses a module boundary — same `{current}` ref pattern Phase 3
  // introduced for `lastReportedFps`.  `destroy()` reads through the
  // ref to detach the listeners.
  const detachControlsRef: { current: (() => void) | null } = { current: null };

  // ── Async startup ────────────────────────────────────────────────────────

  // Flat slot registry, keyed by `slot.name`.  Lifted to outer scope so the
  // public handle can expose it as `assetSlots` (consumed by the
  // `LoadingDevPanel` debug component — see `EngineHandle.assetSlots`).
  // The IIFE below populates this Map as each slot is minted; it stays
  // empty until then.  The same Map instance is also handed to
  // `aggregateRegistry` / `createLoadProgressEmitter`, so the loading
  // bar and the dev panel agree byte-for-byte on what's "in flight".
  const allSlots = new Map<string, AssetSlot<unknown, unknown>>();

  cb.lifecycle?.onStatusChange?.({ kind: 'initializing' });

  // ── Bootstrap dependency bag ─────────────────────────────────────────────
  //
  // The four bootstrap phases (`initGpu`, `wireSlots`, `wireInput`,
  // `startLoop`) live in `phases/*.ts` and consume a shared
  // `BootstrapDeps` object built here.  It carries the canvas + cb args,
  // `{current}` ref boxes for forward-declared bindings (frameRef,
  // detachControlsRef, handleRef), and the values needed for
  // `RunFrameDeps` assembly in `startLoop` (fpsCounter, lastReportedFps,
  // allSlots).
  //
  // `handleRef.current` is null at this point — the public handle is
  // declared AFTER the bootstrap IIFE below.  `wireInput`'s onDoubleClick
  // closure reads through the ref lazily, so the assignment that lands
  // a few lines past the IIFE is in scope by the time a user can
  // physically double-click the canvas.
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
  // The main async IIFE runs the bootstrap phases.  All errors are
  // caught here and reported via `onStatusChange`.  See
  // `phases/bootstrap.ts`'s `runBootstrapPhases` header for what the
  // four-await chain covers.
  (async () => {
    try {
      await runBootstrapPhases(state, bootstrapDeps);

      // ── Dev-only: trigger the synthetic Gaussian volume ──────────────
      //
      // This mirrors the pattern used by the synthetic point-cloud slot
      // fallback in `wireSlots.ts` (`synthSlot.load(...)` at the end of
      // the parallel survey gate).  The volume slot was minted and
      // registered inside `wireSlots` but intentionally left without an
      // initial `load()` call — the load trigger lives here, AFTER
      // `runBootstrapPhases`, because the slot's commit step calls
      // `state.gpu.scalarVolumeRenderer.addField(...)`, and that renderer
      // is only guaranteed non-null once `initGpu` has completed (which
      // is part of `runBootstrapPhases`).  Calling `load()` before
      // `initGpu` resolves would race the renderer construction; calling it
      // here means the renderer is always ready by the time the async
      // fetch resolves and the commit fires.
      //
      // The `import.meta.env.DEV` guard is mandatory: the slots
      // themselves are only minted in dev builds (see `wireSlots.ts`),
      // so `state.assetSlots.syntheticVolumes` is `undefined` in
      // production.  The truthiness check is purely defensive — Vite's
      // dead-code elimination would strip this entire branch in a
      // production build regardless, because `import.meta.env.DEV` is
      // a compile-time constant that evaluates to `false` outside
      // `vite dev`.
      //
      // Synthetic fixtures default-off; the lazy-load shim in
      // `setVolumeFieldEnabled` fetches the cube on first toggle-on.
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
  // The thirteen table-driven setters land in `boringSetters` and the
  // bespoke ones (async bakes, subsystem forwards, multi-field
  // mutations) live as local `function`s below.  The handle literal at
  // the end stitches both into the eleven sub-handle clusters that make
  // up the public surface.
  const boringSetters = buildSettersFromTable(state, cb, () =>
    state.subsystems.scheduler.requestRender(),
  ) satisfies Record<SettingsTableKey, (value: unknown) => void>;

  // ── Bespoke methods (don't fit the settingsTable shape) ────────────
  //
  // Each function below owns work the descriptor table can't express:
  // async worker bakes (`setBiasMode`), per-source asset-slot reloads
  // (`setTier`), subsystem forwards (`connectSpaceMouse`,
  // `setSpaceMouseSensitivity`), multi-field mutations
  // (`setSourceVisible`), or returning live engine state
  // (`getCloud`, `listVolumeFields`).  They're declared up-front so the
  // sub-handle literal below can reference each by its local name —
  // no `handle.X!` forward references, no `!` non-null assertions.

  function clearSelection(): void {
    // Unified teardown — clears galaxy AND POI selection in one call.
    // The branching + render-scheduling lives in `clearAll` so the
    // engine.ts closure stays a thin wrapper.  See clearAll.ts for the
    // "close the card" rationale and the order-of-firing guarantee.
    clearAll(state, cb);
  }

  function setBiasMode(mode: BiasMode): void {
    // Forwarded into the per-frame uniform on the next draw.  The
    // shader branches on the integer value (0 = none, 1 = volume-
    // limited, …) so flipping this takes effect on the next rendered
    // frame without any pipeline rebuild.
    //
    // We always fire the echo callback — even when the mode is
    // unchanged — so the UI seeds correctly on first call.
    //
    // Routes through `biasCorrectionSubsystem`, which owns the mode-flag
    // mirror, cached per-source ratios/weights, and the worker-runner
    // registry; the renderer keeps only the layout-aware splice surface
    // (`spliceSchechterRatios` / `spliceAngularWeights` /
    // `clearBiasOverlays`).  The `void` discards the returned Promise —
    // engine.ts doesn't await.  The subsystem's `setMode` calls
    // `state.subsystems.scheduler.requestRender()` itself when each
    // per-source splice completes, so visuals update progressively as
    // bakes resolve.
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
    // Dispatch by type — public surface is one method, but the two
    // commit paths stay separate (different tween shapes, different
    // cam-null gating, different callback surface).  See commitFocus
    // for the predicate-based routing.
    //
    // The galaxy branch retains the cam-null guard from the original
    // focusOn(info: GalaxyInfo): without it, a focus call during
    // bootstrap would update `#focus=…` in the URL while the camera
    // silently refused to move.  The POI branch intentionally skips the
    // guard (see commitPoiFocus module header for why deep-link drains
    // need POI state to land pre-camera).
    if (!isPoi(target) && !state.cam) return;
    commitFocus(state, cb, target);
  }

  function focusOnHome(): void {
    // Snapshot null-check; cam-null is absorbed inside the helper.
    if (!state.initialCamSnapshot) return;

    // Returning to the home view means we're no longer focused on any
    // particular galaxy.  Notify so the URL clears its `#focus=…`.
    // Stays at the call site (not in the helper) because firing
    // `onFocusChange(null)` is "this action is leaving a focus
    // state", which `tweenToCameraSnapshot` doesn't decide.
    cb.camera?.onFocusChange?.(null);

    tweenToCameraSnapshot(state, state.initialCamSnapshot);
  }

  function focusOnMilkyWay(): void {
    // Distinct from `focusOnHome`: home is the bootstrap-derived wide
    // framing at hundreds of Mpc, well past the impostor's fade-out
    // threshold.  This method tweens to a viewpoint inside the
    // impostor's full-visibility band so the Milky Way is the
    // dominant on-screen subject — target Sgr A* in world space, ride
    // in to `MILKY_WAY_VIEW_DISTANCE_MPC`, preserve the user's
    // current yaw/pitch so they don't get a disorienting snap.
    //
    // Reuses `tweenToCameraSnapshot` (the same helper that powers
    // `focusOnHome`) by synthesizing an `InitialCam`-shaped snapshot
    // on the fly.
    const cam = state.cam;
    if (!cam) return;

    // The Milky Way isn't a catalog object, so any pinned focus on a
    // catalog galaxy is no longer relevant — clear it so the URL
    // hash doesn't keep trying to resolve a stale focus.
    cb.camera?.onFocusChange?.(null);

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
    // Guard: famous catalog may not be loaded yet (sidecars arrive async,
    // slightly after the point cloud).  Early return is safe — the user
    // would have to invoke the palette in the ~500 ms window before the
    // sidecar fetch resolves, which is cosmetically acceptable.
    const cloud = state.sources.catalogs.get(Source.Famous);
    if (!cloud) return;
    const localIdx = state.sources.famousMeta.findIndex((m) => m.id === id);
    if (localIdx < 0) return;

    // Build the same GalaxyInfo the picker would, using the live sidecars
    // so the famous block (name, description, thumbnail) populates.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      Source.Famous,
      state.sources.famousMeta,
    );
    if (!info) return;

    // selectFamous is a deliberate user focus action (palette pick),
    // so the camera-focus target moves to this galaxy too — hence
    commitGalaxyFocus(state, cb, info);
  }

  type SelectByAliasTarget = {
    source: SourceType;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
  };

  function selectByAlias({ source, localIdx, famousMeta }: SelectByAliasTarget): void {
    // Guard: source cloud may not be loaded yet (e.g. user opened
    // the palette before GLADE finished arriving), or the localIdx
    // could be stale across a tier swap.  Both are safe early-return
    // conditions — palette stays open, no selection happens.
    const cloud = state.sources.catalogs.get(source);
    if (!cloud) return;
    if (localIdx < 0 || localIdx >= cloud.count) return;

    // Build a GalaxyInfo so the InfoCard populates correctly.
    // Caller-supplied `famousMeta` wins over the engine's internal
    // copy — see the EngineHandle JSDoc for the race this defends
    // against.
    const info = buildGalaxyInfo(
      cloud,
      localIdx,
      source,
      famousMeta ?? state.sources.famousMeta,
    );
    if (!info) return;

    commitGalaxyFocus(state, cb, info);
  }

  function loadPgcAliasesFn(): Promise<PgcAliasMap> {
    // Set the edge-triggered request flag and wake the loop: the pgcAlias row
    // demands on `ctx.request('paletteOpened')`, so the next frame's
    // `reevaluateDemand` fires its load. The flag stays set (harmless — the
    // idle-guard prevents a re-fetch on later frames), so a second palette
    // open resolves straight off the already-ready slot. An errored alias
    // load is NOT auto-retried (the idle-guard skips a non-idle slot);
    // awaitSlotReady then resolves to the empty-map fallback — graceful
    // degradation, matching every other demand-driven asset.
    state.requests.add('paletteOpened');
    state.subsystems.scheduler.requestRender();
    return awaitSlotReady(state.assetSlots.pgcAlias, new Map() as PgcAliasMap);
  }

  async function setSourceVisible(source: SourceType, visible: boolean): Promise<void> {
    // Delegate to the module-scope helper so tests can drive the same logic
    // against a partial-state stub without a full GPU engine. Loading is the
    // render loop's per-frame `reevaluateDemand`, not this setter's concern.
    return setSourceVisibleImpl(state, { cb }, source, visible);
  }

  function setTier(tier: Tier): void {
    if (tier === state.sources.tier) return;
    const prevTier = state.sources.tier;
    state.sources.tier = tier;
    cb.sources?.onTierChange?.(tier);

    // For each tier-relevant source, decide whether the new tier needs
    // a re-fetch.  Same target → skip; different target → hand the
    // slot the new request and let it cancel any prior in-flight load,
    // re-fetch the new tier's `.bin`, and run its commit step.
    //
    // Hidden sources skip the tier-change fetch too — there's no point
    // downloading a new tier of a survey the user can't see.  When they
    // later toggle it on, `setSourceVisible` flips drawMask and the
    // demand loop loads the now-visible slot at the current tier.
    //
    // Filaments are NOT swapped on tier change — see
    // `filamentFetcher.ts`'s docblock for the rationale.
    for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
      const src = cfg.source;
      if (cfg.category === 'synthetic') continue;
      if (tierTarget(src, prevTier) === tierTarget(src, tier)) continue;
      if (!maskHas(state.sources.drawMask, src)) continue;
      state.assetSlots.points.get(src)?.load({ source: src, tier });
      // Companion sidecars reload in lockstep with the bin so
      // localIdx lookups stay valid after a tier flip.
      loadCompanionAssets(state, cfg, tier);
    }

    // MCPM volume: tier-aware (unlike CF-4). Same per-tier reload semantics
    // as the point-source loop above — different fetcher, different field
    // handle, but the AssetSlot machinery handles cancellation of any
    // in-flight previous-tier load identically.
    state.assetSlots.mcpm?.load({ tier });

    // Hi-res LOD-3 famous-galaxy texture is tier-aware on its layerSide
    // (512 px on small / mobile, 1024 px on medium + large; see
    // HI_RES_LAYER_SIDE_BY_TIER).  WebGPU textures are immutable in
    // shape, so a tier flip forces a destroy + recreate of the
    // texture + planner pair AND a re-bind of the renderer's hi-res
    // view.  See `helpers/rebuildHiResFamousForTier.ts` for the full
    // teardown-order rationale.
    //
    // device + texturedDiskRenderer are both null until initGpu finishes;
    // the early return below skips the rebuild if either is missing
    // (only happens if setTier somehow fires before bootstrap completes,
    // e.g. a unit test driving the handle directly).
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
    // Master toggle — mutate the settings bag so the per-frame gates
    // in `volumeUpsamplePass.enabled` (and `encodeVolumes` via the
    // same `volumesEnabled` check threaded through) see the new value
    // on the next frame.  We do
    // NOT fire an echo callback (no `cb.onVolumesEnabledChange`)
    // because the React layer owns this value optimistically.
    state.settings.volumes.masterEnabled = enabled;
    // Drive the FadeRegistry on the volumesMaster handle. The
    // encodeHdr* sites multiply this master opacity into every
    // per-field fade lookup, so the entire scalar-volume subsystem
    // ramps in lockstep on master toggle. The pass-enabled gate
    // accepts EITHER masterEnabled === true OR opacity > 0, so the
    // pass keeps blitting through the ~100 ms fade-out tail.
    void state.subsystems.fades.fadeTo(
      { kind: 'volumesMaster' },
      enabled ? 1 : 0,
      enabled ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS,
    );
    state.subsystems.scheduler.requestRender();
  }

  function addVolumeField(fieldId: VolumeFieldId, cube: ScalarCube): void {
    // Upload the cube to the renderer.  If the renderer isn't ready
    // yet, the call is a silent no-op — the field can be re-added
    // once the engine boots.
    state.gpu.scalarVolumeRenderer?.addField(fieldId, cube);
    // Seed the per-field settings entry from the registry defaults if
    // not already present — re-registering the same handle preserves
    // any previously-tuned values.  For the shippable volumes the
    // construction seed already created this entry; the guard then only
    // matters for a dynamically-added handle with no construction seed.
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
    // Drive the FadeRegistry from the persisted enable bit:
    //  - Field enabled → fade up to 1 over FADE_IN_DURATION_MS.
    //  - Field disabled → leave the registry at the initial 0 set by
    //    the onFieldAdded callback. The renderer's draw loop's
    //    `(!enabled && opacity <= 0)` skip clause keeps the field
    //    invisible until the user toggles it on (which fires the
    //    fade-in via setVolumeFieldEnabled).
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
   * Lazy-load the DEV-only debug volume slot backing a field, if it exists
   * in `idle` state.  The shippable volumes (CF-4, MCPM) are NOT handled
   * here — they're `ASSET_WIRING` rows whose demand reads
   * `fields[id].enabled`, so they load via `reevaluateDemand`.  The three
   * debug fixtures are excluded from the registry (DEV-only, no on-disk
   * payload to tree-shake), so they keep a direct lazy-load.
   *
   * Idempotent — calling on a `loading` / `ready` / `error` slot is a
   * no-op, so flipping a field off-then-on doesn't re-fetch.  A no-op for
   * cf4/mcpm field ids (no matching switch arm), mirroring how
   * `reevaluateDemand` is a no-op for the debug ids (not rows) — clean
   * separation of the two load mechanisms.
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
    // Flip the settings flag: the demand predicate for cf4-density / mcpm
    // reads `fields[id].enabled`, and the per-frame `reevaluateDemand` (woken
    // by the requestRender below) loads them when it flips on — idle-guarded,
    // so a field flipped off-then-on doesn't re-fetch. The three DEV debug
    // fixtures aren't demand rows, so they keep a direct lazy load here; it's
    // a no-op for the cf4/mcpm field ids, so the two paths are a clean
    // partition.
    if (state.settings.volumes.fields[fieldId]) {
      state.settings.volumes.fields[fieldId].enabled = enabled;
    }
    if (enabled) maybeLazyLoadDebugVolume(fieldId);
    state.gpu.scalarVolumeRenderer?.setEnabled(fieldId, enabled);
    // Drive the FadeRegistry alongside the renderer flip. The renderer's
    // draw loop accepts (!enabled && opacity <= 0) as the skip condition,
    // so the field keeps rendering through the ~100 ms fade-out tail.
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
    // Every subsystem and every GPU renderer now satisfies `Destroyable`
    // (see `@types/Destroyable.d.ts` and the `_EnforceDestroyable`
    // compile-time guard at the bottom of `EngineSubsystemHandles.d.ts`).
    // That uniformity lets this function read top-to-bottom as a flat
    // list of `.destroy()` calls instead of the previous mosaic of
    // ad-hoc `cancelRender()` / `detach()` / `destroy()` invocations.
    //
    // The ordering below is load-bearing for the first two groups
    // (scheduler before everything; DOM listeners before subsystems
    // that may fire from them).  Past that, teardown order is free —
    // subsystems and renderers are independent of each other for
    // destroy() purposes.

    // 1. Cancel the render loop first — every subsequent destroy() must
    //    be safe to call after the loop has stopped.
    state.subsystems.scheduler.destroy();

    // 2. Detach DOM-level listeners next (before subsystems that may
    //    fire from those listeners are torn down).
    state.subsystems.inputBindings?.destroy();
    state.subsystems.inputBindings = null;
    detachControlsRef.current?.();
    detachControlsRef.current = null;

    // 3. Walk every other subsystem. Order doesn't matter past this
    //    point — all subsystems are independent of each other for
    //    teardown.
    state.subsystems.selection.destroy();
    state.subsystems.tweens.destroy();
    state.subsystems.biasCorrection.destroy();
    state.subsystems.youAreHere.destroy();
    state.subsystems.labelDirector.destroy();
    state.subsystems.pois.destroy();
    // Teardown order across the impostor subsystems matters:
    // texturedDisks reads `hiResFamous.lastOutput` per frame and
    // subscribes to galaxyAtlas's eviction handler, so destroy it
    // first. hiResFamous subscribes to its underlying texture's evict
    // handler — destroy the subsystem before the texture so the
    // handler isn't invoked against a torn-down planner. proceduralDisks
    // is independent; galaxyAtlas releases its GPU texture last among
    // the LOD-1/2 trio.
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

    // 4. GPU renderers — every one satisfies Destroyable too.  WebGPU
    //    buffers/textures do NOT release via JS GC alone, so destroy()
    //    is mandatory for each.  The point renderer (state.gpu.renderer)
    //    owns the largest allocations in the app (per-source vertex
    //    buffers, ~14 MB GPU + ~14 MB CPU mirror per SDSS deck).
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

    // 5. Drop remaining strong references to aid GC.
    state.sources.catalogs.clear();
    state.cam = null;
  }

  // ── Handle literal — eleven sub-handle clusters + destroy + slots ──
  //
  // Each sub-handle is a thin forwarder onto the local function or the
  // table-driven `boringSetters` resolved above.  No logic is
  // duplicated; this literal is the only public surface.
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
      // Drive the FadeRegistry alongside the boolean flip so the user
      // sees a smooth ramp on toggle. milkyWayPass.enabled accepts
      // EITHER the boolean OR a non-zero overlay opacity, so we can
      // flip the setting first and let the gate keep the pass alive
      // through the ~100 ms fade-out tail.
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
      // Drive the FadeRegistry alongside the boolean flip so the user
      // sees a smooth ramp on toggle. The pass.enabled gate in
      // filamentsPass.ts accepts EITHER the boolean OR a non-zero
      // fade opacity, so we can flip the setting first and let the
      // gate keep the pass alive through the ~100 ms fade-out tail.
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
      // Two parallel setters — one per axis — since label-text is
      // independent of marker-glyph.  Both follow the same shape:
      // forward into the POI subsystem (which owns the canonical record
      // consulted by its respective producer), mirror the change into
      // `state.settings` so the engine-side bag stays source-of-truth,
      // then echo a fresh copy of the affected record so subscribers
      // can treat each emission as an immutable snapshot.  The OTHER
      // axis is never touched — flipping label visibility off does NOT
      // hide the marker, and vice versa.  See `poiSubsystem.ts`'s
      // module docblock for the orthogonality rationale.
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
    // ── Debug sub-handle (observability + dev toggles, not knobs) ────────
    //
    // `timingService`: getter rather than a copied reference because
    // `state.gpu.timingService` is assigned by the async `initGpu` IIFE
    // AFTER this handle literal is constructed.  A copied value would
    // be `null` forever; the getter reads the live slot whenever the
    // React shell asks for it.
    //
    // `passOverrides`: DebugPanel hook that mutates
    // `state.debug.disabledPasses`.  `allNames` is materialised once
    // from `HDR_PASSES` + `UI_PASSES` (both immutable registries) so
    // the React rows stay in lockstep with the encoder's pass loop.
    // Every `setDisabled` wakes the scheduler so the toggle is visible
    // even when the render-on-demand loop is idle.
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
      setShowDiskRadiusRing: (enabled: boolean) =>
        boringSetters.setShowDiskRadiusRing(enabled),
    },

    destroy,

    // ── Asset-slot registry (dev-panel surface) ──────────────────────────
    //
    // `allSlots` is declared at outer scope and populated by the GPU init
    // IIFE.  Exposing the same Map reference here means the dev panel
    // observes new slots as they appear.  Read-only at the type level so
    // misuse from the React side (mutating the slot bag directly) trips
    // the typechecker.
    assetSlots: allSlots,
  };

  // Publish the handle to the bootstrap deps so `wireInput`'s onDoubleClick
  // closure can resolve `handle.focusOn(...)` lazily.  The handle literal
  // above is fully constructed at this point; the bootstrap IIFE may still
  // be in flight (resolves async), but by the time the user can physically
  // double-click the canvas, the orbit controls are wired and `handleRef`
  // is non-null.
  handleRef.current = handle;

  return handle;
}
