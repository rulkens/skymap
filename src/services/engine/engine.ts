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
 *   - `autoLod.ts`             — LOD heuristic (also re-exported as public API)
 *   - `focusTween.ts`          — focus camera tween constants + distance helper
 *   - `pointInfoBuilder.ts`    — buildPointInfo / maxAbsCoord / niceRound
 *   - `cloudLoader.ts`         — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *   - `cameraFraming.ts`       — bbox + FOV → initial camera snapshot
 *   - `seedSettingsCallbacks.ts` — fan-out of default settings to optional cb hooks
 *   - `scaleBar.ts`            — pure scale-bar tick selection + label formatting (consumed by React)
 *
 *   Subsystems (closure-returning factories with internal state):
 *   - `tweenManager.ts`        — at-most-one in-flight CameraTween facade
 *   - `spaceMouseSubsystem.ts` — 6DOF puck device + per-frame camera mutation
 *   - `clickHandler.ts`        — pick → globalIdx → PointInfo resolver
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
 * `selectionEq` / `pointInfoForSelection` — into the closure-returning
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

import { Source, maskWith, maskWithout } from '../../data/sources';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_VOLUME_FIELD_INTENSITY,
  DEFAULT_VOLUME_PALETTE_ID,
} from '../../data/defaults';
import type { LodMode, PointCloud, PointInfo } from '../../@types';
import type { EngineCallbacks, EngineHandle, EngineState } from '../../@types';

import { createTweenManager } from './camera/tweenManager';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createSelectionSubsystem } from './subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createYouAreHereSubsystem } from './subsystems/youAreHereSubsystem';
import { createFpsCounter } from './subsystems/fpsCounter';
import { buildPointInfo } from './helpers/pointInfoBuilder';
import { commitFocus } from './helpers/commitFocus';
import { logCameraState } from './helpers/logCameraState';
import type { AssetSlot } from '../loading/types';
import { awaitSlotReady } from '../loading/awaitSlotReady';
import { type PgcAliasMap } from '../loading/fetchers/pgcAliasFetcher';
import { TIER_TARGETS } from '../../data/tierTargets';
import {
  snapToCameraSnapshot,
  tweenToCameraSnapshot,
} from './camera/cameraSnapshot';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../data/galacticCenter';
import { getVolumeFieldDefaults } from '../../data/volumeFieldDefaults';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem (WebHID device handle, axes-cache, dt-baseline,
// sensitivity scalar, per-frame camera mutation) lives in
// `spaceMouseSubsystem.ts`.  Engine-side we just instantiate it once,
// pass it `cancelTween` / `onAxes` / `onConnectionChange` callbacks,
// and call `applyToCamera()` from `frame()`.  The handle's
// connect/disconnect/sensitivity setters forward straight through.
import { createSpaceMouseSubsystem } from './subsystems/spaceMouseSubsystem';
import { buildSettersFromTable, type SettingsTableKey } from './wiring/settingsTable';
import { runBootstrapPhases, type BootstrapDeps } from './phases/bootstrap';

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
  // per-sub-bag `.d.ts` siblings) for the type-level map of every field,
  // with per-bag rationale.  Sub-bag groupings:
  //
  //   - `settings`   → SettingsPanel-surfaced knobs (initial values
  //                    seeded from `data/defaults.ts`, the single
  //                    source of truth shared with App.tsx so the
  //                    panel doesn't flash a stale value before the
  //                    first echo callback fires).
  //   - `bias`       → Malmquist-bias correction tuning (mode + four
  //                    threshold/Schechter parameters; the latter
  //                    three stay 0 until the shader's mode-2/3/4
  //                    branches activate via the `setBiasMode` lazy
  //                    bake forwarded to
  //                    `state.subsystems.biasCorrection.setMode`).
  //   - `sources`    → loaded `PointCloud`s + visibility bitmask +
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
  // resources (device, context, thumbnailRenderer, diskRenderer) that
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
    settings: {
      pointSizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      autoRotate: DEFAULT_AUTO_ROTATE,
      galaxyTexturesEnabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
      milkyWayEnabled: DEFAULT_MILKY_WAY_ENABLED,
      filamentsEnabled: DEFAULT_FILAMENTS_ENABLED,
      filamentIntensity: DEFAULT_FILAMENT_INTENSITY,
      volumesEnabled: DEFAULT_VOLUMES_ENABLED,
      // Starts empty; populated by addVolumeField / cleared by removeVolumeField.
      // The SettingsPanel reads this bag to render per-field intensity sliders
      // without going through the GPU handle.
      volumeFields: {},
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnlyMode: DEFAULT_REAL_ONLY_MODE,
      depthFadeEnabled: DEFAULT_DEPTH_FADE_ENABLED,
      exposure: DEFAULT_EXPOSURE,
      toneMapCurve: DEFAULT_TONE_MAP_CURVE,
      // ── Task 2 of H5 namespace restructure: nested sub-bags ───────
      // Seeded from the SAME defaults as the flat fields above.  Both
      // shapes coexist until consumer-side migration is complete (Task
      // 11 deletes the flat fields).  We do NOT introduce a "single
      // source of truth" via a getter alias here — that would mean
      // tests can't write to both shapes independently, and the dual-
      // write pattern in Task 5 explicitly relies on each shape being
      // its own mutable slot.
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
      // `state.bias` — they're worker outputs, not settings.
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
        enabled: DEFAULT_FILAMENTS_ENABLED,
        intensity: DEFAULT_FILAMENT_INTENSITY,
      },
      volumes: {
        masterEnabled: DEFAULT_VOLUMES_ENABLED,
        fields: {},
      },
    },
    bias: {
      // Why -19 as the volume-limited default?  It's roughly the
      // absolute magnitude where the SDSS spectroscopic main sample
      // is volume-complete out to the survey's flux limit — bright
      // enough that almost every catalog galaxy meeting it has a
      // measured spectrum, dim enough that we still see plenty of
      // structure.
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: DEFAULT_ABS_MAG_LIMIT,
      // Sentinels overwritten before the shader's mode-2/3/4 branches
      // are reachable; see `setBiasMode` for the lazy worker bake.
      apparentMagLimit: 0,
      schechterMStar: 0,
      schechterAlpha: 0,
    },
    sources: {
      // 32-bit bitmask, one bit per `Source` enum value.  The
      // renderer iterates `loadedSources()` and skips any whose bit
      // is clear.  Default = ALL_VISIBLE_MASK so "draw everything
      // that is loaded" holds until either the auto-LOD heuristic
      // recomputes it from the camera distance, or the user toggles
      // a single source in the settings panel.
      visibleMask: DEFAULT_VISIBLE_SOURCE_MASK,
      // 'auto'   → per-frame `autoLodMask(cam.distance)` rewrite.
      // 'manual' → user owns the mask; auto-LOD paused.
      lodMode: DEFAULT_LOD_MODE,
      // Mirrors the renderer's per-source GPU buffers in CPU memory
      // so picking can resolve `(source, localIdx)` into a PointInfo
      // without a GPU readback for every hover.  Empty until the
      // first parallel fetch resolves.
      clouds: new Map<Source, PointCloud>(),
      // Optional sidecars — `pointInfoBuilder` null-checks both, so a
      // hover firing before they land just renders the generic
      // InfoCard layout.
      famousMeta: [],
      famousXrefs: {},
      // Currently-loaded data tier.  Seeded from `cb.initialTier` (Task 5
      // of the data-tiers plan); the default of 'medium' matches the
      // pre-tier ~600k-galaxy desktop budget.  `setTier` mutates this in
      // place before kicking off per-source reloads.
      tier: cb.initialTier ?? 'medium',
    },
    picking: {
      // hovered/selected used to live here — they moved to
      // `state.subsystems.selection` in Spec D.3.  This bag now
      // exclusively holds the per-frame pick-throttle state (see
      // `EnginePickingState.d.ts` for the narrowed responsibility).
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
      postProcess: null,
      filamentRenderer: null,
      // labelRenderer + markerLineRenderer: null until initGpu completes
      // the loadFontAtlas() fetch and constructs both renderers.  They're
      // excluded from the isEngineReady predicate (same rationale as
      // filamentRenderer — optional async resources, null-checked at
      // point of use by labelsPass / markerLinesPass).
      labelRenderer: null,
      markerLineRenderer: null,
      // thumbnailRenderer / diskRenderer / proceduralDiskRenderer /
      // milkyWayRenderer: null until initGpu constructs them.  These
      // four don't gate any frame-loop logic via state.gpu — the frame
      // body still reads them through RunFrameDeps (assembled in
      // `phases/startLoop.ts` from `phaseLocals`).  They live here
      // exclusively so `destroy()` below has a reachable reference to
      // release each renderer's GPU buffers.  Pre-2026-05-08 they
      // lived only on the bootstrap-local `phaseLocals` carrier, which
      // is intentionally short-lived (goes away once `startLoop`
      // finishes), leaving destroy() unable to clean them up.  See
      // `EngineGpuHandles.d.ts` for the full reachability story.
      thumbnailRenderer: null,
      diskRenderer: null,
      proceduralDiskRenderer: null,
      milkyWayRenderer: null,
      // Constructed during initGpu, null until then.  Excluded from the
      // isEngineReady predicate — the scalarVolumePass optional-chains
      // hasActiveFields() so a null handle is a silent no-op.
      scalarVolumeRenderer: null,
    },
    subsystems: {
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
          // Nested fire only (H5 task 11).  The SpaceMouse subsystem is the
          // single site that fires the connected-change echo for both
          // `connectSpaceMouse` and `disconnectSpaceMouse` (the handle
          // methods don't echo directly — the subsystem's lifecycle
          // owns the truth and pushes it back out via this callback).
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
        getCloud: (s) => state.sources.clouds.get(s),
        getFamousMeta: () => state.sources.famousMeta,
        getFamousXrefs: () => state.sources.famousXrefs,
      }),

      // ── Bias-correction subsystem (Spec E phase E.3 + E.4) ────────
      // Owns Malmquist-bias mode flags, cached per-source ratios/
      // weights, and the async bake state machine — extracted from
      // PointRenderer.  Constructed eagerly here (no GPU dep); the
      // renderer is wired during `phases/initGpu` via
      // `attachRenderer(...)`.  Phase E.4 cut `handle.setBiasMode`
      // over to call `setMode` on this subsystem (see the handle
      // method below) and deleted the renderer's legacy bias-mode
      // methods — production routes mode toggles through here now.
      //
      // No `schechterRunner` / `angularRunner` overrides — the
      // module-level defaults (Vite `?worker` runners on this same
      // subsystem module) take over in production; tests inject
      // synchronous stubs at the test factory call site.
      biasCorrection: createBiasCorrectionSubsystem({ getState: () => state }),

      // ── You-are-here subsystem (Task R4) ─────────────────────────
      // Owns the "YOU ARE HERE" marker fade-alpha state and drives
      // labelRenderer + markerLineRenderer per frame.  Constructed
      // eagerly here (no GPU dep); the two renderers are wired in
      // during `phases/initGpu.ts` via `attachRenderers(...)` after
      // the `loadFontAtlas()` fetch completes.
      youAreHere: createYouAreHereSubsystem(),

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
      // no post-init reassignment.  This is the architectural fix to
      // the Phase 2b "captured the shim by reference" regression that
      // broke hover-pick for one refactor cycle.
      scheduler: createRenderScheduler({ onFrame: () => frameRef.current() }),

      // The remaining three subsystems land later in the IIFE once
      // their dependencies (GPU device, pickRenderer, scheduler) exist.
      thumbnails: null,
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
    // The slot machinery (see `services/loading/AssetSlot.ts`) replaces the
    // imperative `cloudLoader.reloadSource` call sites with a race-checked
    // fetch→commit pipeline.  We declare the Map up-front so consumers can
    // call `state.assetSlots.points.get(source)?.load(...)` without a null
    // check, but the actual slots are constructed inside the GPU init IIFE
    // — they close over `state.gpu.renderer` for their commit step, and
    // that handle is null until `initGpu` resolves.
    //
    // Task 8 populates only the SDSS entry; Task 9 fills in the rest.  An
    // alternative would be to lazily construct slots on first `load()`,
    // but that splits the wiring across two files (engine + setTier helper)
    // and obscures the lifecycle.  Eager construction inside the IIFE
    // keeps every slot's birth and its renderer-handle in the same lexical
    // scope.
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
      pgcAlias: null,
      // CF-4 DM density slot — minted inside the GPU init IIFE alongside
      // the filament slot.  Same null-then-set lifecycle: the slot's
      // commit registers a field on `state.gpu.scalarVolumeRenderer`,
      // which is null until the IIFE constructs it.
      cf4Density: null,
    },
  };

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
  // `BootstrapDeps` object built here.  Anything the pre-Phase-5 IIFE
  // captured from createEngine's outer scope flows through this bag —
  // the canvas + cb args, the `{current}` ref boxes for forward-declared
  // bindings (frameRef, detachControlsRef, handleRef), and the values
  // needed for `RunFrameDeps` assembly in `startLoop`
  // (fpsCounter, lastReportedFps, allSlots).  The pure `cssToTexPx`
  // helper is imported directly in `runFrame.ts` / `wireInput.ts`;
  // scale-bar derivation moved to React-side via `cb.onCameraChange`.
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
  // caught here and reported via `onStatusChange` — same single
  // try/catch contract the pre-Phase-5 IIFE had.  See
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
      // We trigger all three fixtures' loads with the same dims +
      // box size so they overlay coherently when the user toggles
      // them on.  Per-fixture default-enabled state is set inside the
      // slot's commit (Gaussian on; grids off).  The shape
      // discriminator on each request picks which generator the
      // fetcher dispatches to.
      if (import.meta.env.DEV && state.assetSlots.syntheticVolumes) {
        const slots = state.assetSlots.syntheticVolumes;
        slots['debug-gaussian']?.load({
          handle: 'debug-gaussian',
          shape: 'gaussian',
          dims: 64,
          boxSizeMpc: 400,
        });
        slots['debug-cartesian']?.load({
          handle: 'debug-cartesian',
          shape: 'cartesian',
          dims: 64,
          boxSizeMpc: 400,
        });
        slots['debug-spherical']?.load({
          handle: 'debug-spherical',
          shape: 'spherical',
          dims: 64,
          boxSizeMpc: 400,
        });
      }
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
  // H5 (task 6): we build the "boring" table-driven setters into a local
  // first so the sub-handle bag below can forward to them by name without
  // re-implementing any clamp / dual-write logic.  The same object is then
  // spread into the legacy flat surface so consumers wired to either shape
  // observe identical behaviour during the transition.
  const boringSetters = buildSettersFromTable(state, cb, () =>
    state.subsystems.scheduler.requestRender(),
  ) satisfies Pick<EngineHandle, SettingsTableKey>;

  const handle: EngineHandle = {
    // ── Sub-handles (H5 task 6) ──────────────────────────────────────────────
    //
    // Each sub-handle is a thin forwarder onto the existing flat
    // implementation that's in scope — either the table-driven
    // `boringSetters` or one of the bespoke methods spelled out below.
    // No logic is duplicated; the flat block stays the single source of
    // truth until Task 11 deletes it and these become the only callable
    // shape.
    points: {
      setSize: (sizePx) => boringSetters.setPointSize(sizePx),
      setBrightness: (value) => boringSetters.setBrightness(value),
      setDepthFade: (enabled) => boringSetters.setDepthFadeEnabled(enabled),
      setHighlightFallback: (enabled) =>
        boringSetters.setHighlightFallback(enabled),
      setRealOnly: (enabled) => boringSetters.setRealOnlyMode(enabled),
    },
    tonemap: {
      setExposure: (value) => boringSetters.setExposure(value),
      setCurve: (curve) => boringSetters.setToneMapCurve(curve),
    },
    // The `!` non-null assertions below acknowledge that the flat
    // methods these forward to are declared optional on EngineHandle
    // (the type started life with optional setters to permit minimal
    // engine builds), but inside this literal we are concurrently
    // defining every one of them, so at runtime they are never
    // undefined.  Task 11's flat-method deletion lets us drop both the
    // optional markers and these assertions in one pass.
    camera: {
      setAutoRotate: (enabled) => boringSetters.setAutoRotate(enabled),
      reset: () => handle.resetCamera(),
      focusOn: (info) => handle.focusOn(info),
      focusOnHome: () => handle.focusOnHome(),
      focusOnMilkyWay: () => handle.focusOnMilkyWay(),
      logState: () => handle.logCameraState(),
    },
    selection: {
      clear: () => handle.clearSelection(),
      selectFamous: (id) => handle.selectFamous(id),
      selectByAlias: (target) => handle.selectByAlias!(target),
      loadAliases: () => handle.loadPgcAliases!(),
    },
    sources: {
      setLodMode: (mode) => handle.setLodMode!(mode),
      setVisible: (source, visible) => handle.setSourceVisible!(source, visible),
      setTier: (tier) => handle.setTier!(tier),
      getCloud: (source) => handle.getCloud!(source),
      getCloudObjIds: (source) => handle.getCloudObjIds!(source),
    },
    bias: {
      setMode: (mode) => handle.setBiasMode!(mode),
      setAbsMagLimit: (absMag) => boringSetters.setAbsMagLimit(absMag),
    },
    thumbnails: {
      setEnabled: (enabled) => boringSetters.setGalaxyTexturesEnabled(enabled),
    },
    milkyWay: {
      setEnabled: (enabled) => boringSetters.setMilkyWayEnabled(enabled),
    },
    filaments: {
      setEnabled: (enabled) => boringSetters.setFilamentsEnabled(enabled),
      setIntensity: (value) => boringSetters.setFilamentIntensity(value),
    },
    volumes: {
      setMasterEnabled: (enabled) => handle.setVolumesEnabled!(enabled),
      add: (h, cube) => handle.addVolumeField!(h, cube),
      remove: (h) => handle.removeVolumeField!(h),
      setEnabled: (h, enabled) => handle.setVolumeFieldEnabled!(h, enabled),
      setIntensity: (h, intensity) =>
        handle.setVolumeFieldIntensity!(h, intensity),
      setContrast: (h, contrast) => handle.setVolumeFieldContrast!(h, contrast),
      setDensityScale: (h, value) =>
        handle.setVolumeFieldDensityScale!(h, value),
      setPalette: (h, id) => handle.setVolumeFieldPalette!(h, id),
      list: () => handle.listVolumeFields!(),
      getState: () => handle.getVolumeFieldsState!(),
    },
    input: {
      spaceMouse: {
        connect: () => handle.connectSpaceMouse!(),
        disconnect: () => handle.disconnectSpaceMouse!(),
        isConnected: () => handle.isSpaceMouseConnected!(),
        setSensitivity: (value) => handle.setSpaceMouseSensitivity!(value),
      },
    },

    // ── Legacy flat methods (kept until Task 11 removes them) ────────────────
    clearSelection() {
      // Only fire the callback when something was actually selected.
      // This lets the Esc handler in App.tsx call this unconditionally.
      if (state.subsystems.selection.selected() !== null) {
        state.subsystems.selection.setSelected(null);
        // Clearing the pin also clears the camera-focus target — Esc /
        // close ✕ are explicit "I'm done with this galaxy" signals.
        cb.camera?.onFocusChange?.(null);
        state.subsystems.scheduler.requestRender();
      }
    },

    destroy() {
      // 1. Cancel any in-flight frame so we don't tick after teardown.
      state.subsystems.scheduler.cancelRender();

      // 2. Detach every pointer/keyboard/resize listener attached via
      //    inputBindings (the module owns the bookkeeping internally).
      state.subsystems.inputBindings?.detach();
      state.subsystems.inputBindings = null;

      // 3. Detach orbit controls (removes its own four listeners).
      //    `detachControlsRef.current` was assigned by the `wireInput`
      //    bootstrap phase; null when destroy() runs before bootstrap
      //    completes (e.g. unmount during data load).
      detachControlsRef.current?.();
      detachControlsRef.current = null;

      // 5. Release GPU resources.
      state.gpu.pickRenderer?.destroy();
      state.gpu.pickRenderer = null;
      // postProcess owns the rgba16float HDR texture and the 16-byte
      // tone-map uniform buffer (merged into one aggregate in Phase 4).
      // Must be released so a hot-reload / remount doesn't leak a
      // per-mount texture (~16 MB at 2× DPR 1080p).
      state.gpu.postProcess?.destroy();
      state.gpu.postProcess = null;
      // Filament renderer owns three GPU buffers (uniform + index + quad
      // VBO) plus an optional per-segment instance buffer.  Release them
      // explicitly so HMR / StrictMode remounts don't leak the instance
      // buffer (proportional to filament-skeleton segment count, ~MB).
      state.gpu.filamentRenderer?.destroy();
      state.gpu.filamentRenderer = null;
      // Label renderer owns: uniform buffer, storage buffer (LabelData[]),
      // instance buffer (per-glyph), corner buffer, and the MSDF atlas
      // texture.  Release explicitly — the atlas texture is the most
      // significant allocation (~1 MB for the 512² rgba8unorm atlas).
      state.gpu.labelRenderer?.destroy();
      state.gpu.labelRenderer = null;
      // Marker-line renderer owns: uniform buffer, instance buffer, and
      // corner buffer.  Small allocations but must be released for parity
      // with every other GPU handle in this bag.
      state.gpu.markerLineRenderer?.destroy();
      state.gpu.markerLineRenderer = null;
      // Thumbnail / disk / procedural-disk / Milky-Way renderers each
      // own a uniform buffer + per-instance buffer + (per-renderer
      // specifics: corner buffer for the quad-derived ones, atlas
      // sampler for thumbnails).  Pre-2026-05-08 these renderers
      // lived on the bootstrap-local `phaseLocals` carrier which
      // engine.ts had no reference path to — leaking a few hundred KB
      // of GPU buffers per HMR / StrictMode remount.  Promoting them
      // to `state.gpu.*` (PR #66 follow-up) closed that gap.  Releasing
      // here matches every other handle in this bag.
      state.gpu.thumbnailRenderer?.destroy();
      state.gpu.thumbnailRenderer = null;
      state.gpu.diskRenderer?.destroy();
      state.gpu.diskRenderer = null;
      state.gpu.proceduralDiskRenderer?.destroy();
      state.gpu.proceduralDiskRenderer = null;
      state.gpu.milkyWayRenderer?.destroy();
      state.gpu.milkyWayRenderer = null;
      // Scalar-volume renderer owns: shared corner/index VBOs plus per-field
      // r16float 3D textures, palette LUT textures, and uniform buffers.
      // The 3D textures can be substantial (e.g. a 128³ cube at 2 bytes/voxel
      // is 4 MB); releasing here prevents VRAM leaks on StrictMode remounts.
      state.gpu.scalarVolumeRenderer?.destroy();
      state.gpu.scalarVolumeRenderer = null;
      // Tear down the thumbnail subsystem (clears the atlas's evict
      // handler and aborts in-flight fetches' write-back).  The atlas's
      // GPU texture itself is released when the device is dropped —
      // the subsystem doesn't expose a destroy on it directly.
      state.subsystems.thumbnails?.destroy();
      state.subsystems.thumbnails = null;
      // Release the WebHID device (no-op if never connected).
      state.subsystems.spaceMouse.destroy();

      // 5b. Release point-renderer GPU resources.  PointRenderer owns the
      // largest GPU allocations in the app — per-source vertex buffers
      // (~14 MB GPU + ~14 MB CPU mirror per SDSS deck, growing across
      // SDSS + GLADE-large + 2MRS + Famous), plus each cloud's CloudFade
      // 16-byte uniform, plus the renderer's own 176-byte uniform.
      // WebGPU buffers do NOT release via JS GC alone — `destroy()` is
      // mandatory.  Without this call, every HMR cycle / StrictMode
      // remount leaks the entire deck.  See PointRenderer.destroy()'s
      // docstring for the full rationale.
      state.gpu.renderer?.destroy();

      // 6. Drop references to aid GC.
      state.gpu.renderer = null;
      state.sources.clouds.clear();
      state.cam = null;
    },

    // ── Settings panel setters ─────────────────────────────────────────────
    //
    // The thirteen "boring" setters (`setPointSize`, `setBrightness`, …
    // `setExposure`, `setToneMapCurve`) all share the same body shape:
    // mutate one field on `state.settings.*` (or `state.bias.*`), fire
    // an optional echo callback, request a render.  Rather than spell
    // them out one-by-one, we build them from a declarative descriptor
    // table in `./settingsTable.ts` and spread the result into the
    // public-handle literal.  See that module's docstring for the
    // why-a-table / why-bespoke-stays-inline rationale.
    //
    // Bespoke setters that DO NOT fit the table — `setBiasMode` (async
    // worker bake), `setTier` (per-source slot reload), `setLodMode`
    // (couples to camera distance), `setSourceVisible` (mask math +
    // implicit LOD-mode switch), `setSpaceMouseSensitivity` (subsystem
    // forward) — keep their hand-rolled bodies below.
    // `satisfies` on the `boringSetters` local above is the safety net
    // the settingsTable docstring advertises: if the builder's return
    // shape ever drifts away from `Pick<EngineHandle, SettingsTableKey>`
    // (renamed key, value type not assignable due to contravariance),
    // tsc catches it at the construction site rather than at distant
    // callers.  We spread the same local here so the legacy flat surface
    // keeps every table-driven setter.
    ...boringSetters,

    setBiasMode(mode) {
      // Forwarded into the per-frame uniform on the next draw.  The
      // shader branches on the integer value (0 = none, 1 = volume-
      // limited, …) so flipping this from devtools or the SettingsPanel
      // takes effect on the next rendered frame without any pipeline
      // rebuild.
      //
      // We always fire the echo callback — even when `mode === state.bias.mode`
      // — so the UI seeds correctly on first call.
      //
      // ### Spec E phase E.4 — cut over to biasCorrectionSubsystem
      //
      // Pre-E.4 this delegated to `state.gpu.renderer.setBiasMode(mode)`
      // and chained a `.then(requestRender)`.  Spec E.4 routes through
      // the subsystem instead — the subsystem owns the mode-flag mirror,
      // the cached per-source ratios/weights, and the worker-runner
      // registry; the renderer keeps only the layout-aware splice
      // surface (`spliceSchechterRatios` / `spliceAngularWeights` /
      // `clearBiasOverlays`).  The `void` discards the returned Promise
      // — engine.ts doesn't await.  The subsystem's `setMode` calls
      // `state.subsystems.scheduler.requestRender()` itself when each
      // per-source splice completes, so visuals update progressively as
      // bakes resolve (same observable behaviour as the pre-E.4 chained
      // `.then`).
      // Dual-write: legacy `state.bias.mode` + new `state.settings.bias.mode`.
      // Task 2's deviation kept `state.bias.mode` alive on `EngineBiasState`
      // (the bake-derived fields next to it can't move yet), so we mirror
      // the value into the nested settings sub-bag for the duration of the
      // H5 transition.  Task 11 collapses to the nested location only.
      state.bias.mode = mode;
      state.settings.bias.mode = mode;
      cb.bias?.onModeChange?.(mode);
      void state.subsystems.biasCorrection.setMode(mode);
      state.subsystems.scheduler.requestRender();
    },

    resetCamera() {
      // Snapshot null-check; cam-null is absorbed inside the helper.
      // Both must exist for a meaningful snap.
      if (!state.initialCamSnapshot) return;
      snapToCameraSnapshot(state, state.initialCamSnapshot);
    },

    logCameraState() {
      logCameraState(state.cam);
    },

    focusOn(info) {
      // Camera may not be ready yet (cloud still loading); drop the
      // call.  This guard is *separate* from `tweenToGalaxy`'s own
      // cam-null guard — we need it here to gate the `onFocusChange`
      // callback fan-out inside `commitFocus`.  Without the early
      // return, a focus call against a still-bootstrapping engine
      // would update `#focus=…` in the URL while the camera silently
      // refused to move.
      if (!state.cam) return;
      commitFocus(state, cb, info);
    },

    selectFamous(id) {
      // Guard: famous catalog may not be loaded yet (sidecars arrive async,
      // slightly after the point cloud).  Early return is safe — the user
      // would have to invoke the palette in the ~500 ms window before the
      // sidecar fetch resolves, which is cosmetically acceptable.
      const cloud = state.sources.clouds.get(Source.Famous);
      if (!cloud) return;
      const localIdx = state.sources.famousMeta.findIndex((m) => m.id === id);
      if (localIdx < 0) return;

      // Build the same PointInfo the picker would, using the live sidecars
      // so the famous block (name, description, thumbnail) populates.
      const info = buildPointInfo(
        cloud,
        localIdx,
        Source.Famous,
        state.sources.famousMeta,
        state.sources.famousXrefs,
      );
      if (!info) return;

      // selectFamous is a deliberate user focus action (palette pick),
      // so the camera-focus target moves to this galaxy too — hence
      // bundling the selection key into `commitFocus` rather than
      // splitting select-without-focus from focus.  No prebuilt info
      // here: the famous catalog has already loaded by the time the
      // palette can fire, so the selection subsystem can safely read
      // the live sidecars itself at fan-out time.
      commitFocus(state, cb, info, { key: { source: Source.Famous, localIdx } });
    },

    getCloudObjIds(source) {
      // Returns the raw BigUint64Array used by the renderer.  We don't
      // make a defensive copy because the only consumer (App.tsx's
      // alias-index builder) walks ~5M elements once and would pay a
      // 40 MB copy cost for nothing — the type contract documents the
      // read-only expectation.
      return state.sources.clouds.get(source)?.objIDs;
    },

    getCloud(source) {
      // Same read-only contract as `getCloudObjIds` above — we hand
      // out the live reference, not a clone, because the resolver
      // walks positions/objIDs once and would otherwise force a
      // multi-MB copy for a one-shot deep-link resolve.  The only
      // current consumer is `resolveFocusTarget`, which never mutates.
      return state.sources.clouds.get(source);
    },

    selectByAlias({ source, localIdx, famousMeta, famousXrefs }) {
      // Guard: source cloud may not be loaded yet (e.g. user opened
      // the palette before GLADE finished arriving), or the localIdx
      // could be stale across a tier swap.  Both are safe early-return
      // conditions — palette stays open, no selection happens.
      const cloud = state.sources.clouds.get(source);
      if (!cloud) return;
      if (localIdx < 0 || localIdx >= cloud.count) return;

      // Build a PointInfo so the InfoCard populates correctly.  We
      // pass the famous sidecars even for non-famous sources because
      // buildPointInfo gracefully ignores them when the source isn't
      // Famous — same call shape as the dblclick path uses.
      //
      // Caller-supplied `famousMeta`/`famousXrefs` win over the
      // engine's internal copies — see the EngineHandle JSDoc for the
      // race this defends against.  The default is the engine's own
      // sidecar state, which keeps every other call site (click,
      // hover, palette alias-search) using a single source of truth.
      const info = buildPointInfo(
        cloud,
        localIdx,
        source,
        famousMeta ?? state.sources.famousMeta,
        famousXrefs ?? state.sources.famousXrefs,
      );
      if (!info) return;

      // Race-window note: when selectByAlias is called from a deep-link
      // drain that fires the moment the data-side cloud lands, the
      // renderer hasn't uploaded yet — the halo will appear once the
      // upload completes a frame or two later.  Passing the prebuilt
      // `info` through `commitFocus` → `setSelected` ensures the React
      // side updates immediately regardless.
      commitFocus(state, cb, info, { key: { source, localIdx }, info });
    },

    focusOnHome() {
      // Snapshot null-check; cam-null is absorbed inside the helper.
      if (!state.initialCamSnapshot) return;

      // Returning to the home view means we're no longer focused on any
      // particular galaxy.  Notify so the URL clears its `#focus=…`.
      // Stays at the call site (not in the helper) because firing
      // `onFocusChange(null)` is "this action is leaving a focus
      // state", which `tweenToCameraSnapshot` doesn't decide.
      cb.camera?.onFocusChange?.(null);

      tweenToCameraSnapshot(state, state.initialCamSnapshot);
    },

    focusOnMilkyWay() {
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
      // on the fly: the catalog-side constants for `target`/`distance`,
      // the live `cam` fields for the orientation and projection
      // values that the helper expects but that we don't actually want
      // to change here.
      const cam = state.cam;
      if (!cam) return;

      // The Milky Way isn't a catalog object, so any pinned focus on a
      // catalog galaxy is no longer relevant — clear it so the URL
      // hash doesn't keep trying to resolve a stale focus.
      cb.camera?.onFocusChange?.(null);

      tweenToCameraSnapshot(state, {
        target: [
          MILKY_WAY_CENTER_WORLD[0],
          MILKY_WAY_CENTER_WORLD[1],
          MILKY_WAY_CENTER_WORLD[2],
        ],
        distance: MILKY_WAY_VIEW_DISTANCE_MPC,
        yaw: cam.yaw,
        pitch: cam.pitch,
        fovYRad: cam.fovYRad,
        near: cam.near,
        far: cam.far,
      });
    },

    // ── LOD + per-source visibility setters ────────────────────────────────
    //
    // These two methods are the public seam for the survey-toggle UI
    // (Task #37 / settings panel).  They are kept tiny on purpose: the
    // engine is the source of truth for `state.sources.lodMode` and
    // `state.sources.visibleMask`, React just mirrors them via the
    // optional callbacks.

    setLodMode(mode) {
      if (mode === state.sources.lodMode) return;
      state.sources.lodMode = mode;
      // Nested-only fire (H5 task 11): flat callbacks were removed.
      cb.sources?.onLodModeChange?.(mode);
      state.subsystems.scheduler.requestRender();
    },

    setSourceVisible(source, visible) {
      // A user explicitly toggling one survey is the strongest possible
      // signal that they want manual control.  Auto-LOD would clobber the
      // mask on the very next frame, so we proactively flip into manual
      // mode here rather than making the caller orchestrate two calls.
      if (state.sources.lodMode !== 'manual') {
        state.sources.lodMode = 'manual';
        // Nested-only fire (H5 task 11) — flat callbacks are gone.
        cb.sources?.onLodModeChange?.('manual');
      }

      const next = visible
        ? maskWith(state.sources.visibleMask, source)
        : maskWithout(state.sources.visibleMask, source);
      if (next === state.sources.visibleMask) return;
      state.sources.visibleMask = next;
      cb.sources?.onMaskChange?.(next);
      state.subsystems.scheduler.requestRender();
    },

    // ── Data-tier hot-swap ────────────────────────────────────────────────
    //
    // The user picks a different data-volume preset (small/medium/large) and
    // we re-fetch only the sources whose target count differs between the two
    // tiers.  2MRS + Famous share one .bin across all tiers, so they're
    // diffed-out and never re-fetched; SDSS + GLADE typically re-fetch.
    //
    // The empty-cloud branch in `reloadSource` (target 0 → exclude) plumbs
    // through the same `renderer.upload` path as a real fetch — passing a
    // 0-count cloud destroys the prior buffer and allocates a 0-byte one,
    // freeing the source's VRAM.  See `pointRenderer.upload`'s replace-not-
    // append regression test for the contract that hot-swap relies on.
    setTier(tier) {
      if (tier === state.sources.tier) return;
      const prevTier = state.sources.tier;
      state.sources.tier = tier;
      // Nested-only fire (H5 task 11): the flat `onTierChange` is gone;
      // consumers consume the nested `callbacks.sources.onTierChange`
      // address.
      cb.sources?.onTierChange?.(tier);

      // For each tier-relevant source, decide whether the new tier needs a
      // re-fetch.  Same target → skip (e.g. 2MRS, Famous always share one
      // .bin across tiers).  Different target → hand the slot the new
      // request and let it cancel any prior in-flight load, re-fetch the
      // new tier's `.bin`, and run its commit step (upload +
      // `clouds.set` + `onCloudReady` + render wake) via the subscriber
      // wired up alongside slot construction.
      //
      // Filaments are NOT swapped on tier change — see
      // `filamentFetcher.ts`'s docblock for the rationale.  No
      // `state.assetSlots.filaments?.load(...)` here is intentional.
      for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
        if (TIER_TARGETS[prevTier][source] === TIER_TARGETS[tier][source]) continue;
        state.assetSlots.points.get(source)?.load({ source, tier });
      }
    },

    // ── Lazy PGC-alias loader (Task 10) ───────────────────────────────────
    //
    // Thin wrapper over `awaitSlotReady`; see that helper's module
    // header for the idempotence / fallback / null-slot / cached-
    // resolve-window rationale that used to live inline here.
    loadPgcAliases() {
      const slot = state.assetSlots.pgcAlias;
      slot?.load();
      return awaitSlotReady(slot, new Map() as PgcAliasMap);
    },

    // ── Scalar-volume field management ────────────────────────────────────
    //
    // Six public methods to drive the ScalarVolumeRenderer from outside
    // the engine (React shell, data-loading logic).  All six optional-
    // chain through `state.gpu.scalarVolumeRenderer` so they're safe to
    // call during the brief window before the GPU init IIFE completes —
    // the renderer is null until `initGpu` runs but that window is
    // typically less than one frame at browser-cold-start.

    setVolumesEnabled(enabled) {
      // Master toggle — mutate the settings bag so the per-frame gate in
      // `scalarVolumePass` sees the new value on the next frame.  We do
      // NOT fire an echo callback here (no `cb.onVolumesEnabledChange`)
      // because the React layer owns this value optimistically (same as
      // `filamentsEnabled`).  The caller (App.tsx) updates React state
      // before forwarding here, so the React copy and the engine copy
      // are always in agreement.
      state.settings.volumesEnabled = enabled;
      state.subsystems.scheduler.requestRender();
    },

    addVolumeField(handle, cube) {
      // Upload the cube to the renderer.  If the renderer isn't ready
      // yet, the call is a silent no-op — the field can be re-added
      // once the engine boots.  In practice, callers load cubes after
      // `onStatusChange({ kind: 'ready' })` fires, so the renderer is
      // always constructed by the time addVolumeField is reachable from
      // application code.
      state.gpu.scalarVolumeRenderer?.addField(handle, cube);
      // Seed the per-field settings entry with defaults if not already
      // present — re-registering the same handle preserves any
      // previously-tuned enabled/intensity/palette values so the user's
      // tweaks don't reset on e.g. a tier-swap reload.  Presentation
      // defaults (palette + densityScale) come from the per-handle
      // registry in `src/data/volumeFieldDefaults.ts` — the cube itself
      // is data-only in SCFD v2.  Unregistered handles fall through to
      // `FALLBACK_VOLUME_DEFAULTS` (viridis + 1.0) so a brand-new field
      // still renders sanely until a tuned entry is added.
      if (!state.settings.volumeFields[handle]) {
        const defaults = getVolumeFieldDefaults(handle);
        state.settings.volumeFields[handle] = {
          enabled: true,
          intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: defaults.contrast,
          densityScale: defaults.densityScale,
          paletteId: defaults.paletteId,
        };
      }
      // Forward the current per-field tunables into the renderer so the
      // new upload inherits whatever the user set before re-registering.
      // The if-guard above ensures the entry exists; the non-null
      // assertion satisfies noUncheckedIndexedAccess on the Record.
      const persisted = state.settings.volumeFields[handle]!;
      state.gpu.scalarVolumeRenderer?.setIntensity(handle, persisted.intensity);
      state.gpu.scalarVolumeRenderer?.setEnabled(handle, persisted.enabled);
      state.gpu.scalarVolumeRenderer?.setContrast(handle, persisted.contrast);
      state.gpu.scalarVolumeRenderer?.setDensityScale(handle, persisted.densityScale);
      state.gpu.scalarVolumeRenderer?.setFieldPalette(handle, persisted.paletteId);
      // Let React know the field list changed so any SettingsPanel list
      // re-renders with the new row.
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },

    removeVolumeField(handle) {
      // Release the renderer's GPU textures for this field.  If the
      // renderer or the field itself is absent, `removeField` is a no-op.
      state.gpu.scalarVolumeRenderer?.removeField(handle);
      // Mirror the removal into the settings bag so the SettingsPanel
      // stops rendering the slider row for this handle.
      delete state.settings.volumeFields[handle];
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },

    setVolumeFieldEnabled(handle, enabled) {
      // Mutate the settings bag first so any optimistic React read sees
      // the new value even before the next render.
      if (state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle].enabled = enabled;
      }
      state.gpu.scalarVolumeRenderer?.setEnabled(handle, enabled);
      state.subsystems.scheduler.requestRender();
    },

    setVolumeFieldIntensity(handle, intensity) {
      // The renderer clamps to [0, 1] internally; mirror the raw value
      // here so the slider can be optimistic without needing to read back
      // from the renderer.  Any clamping will show on the next frame.
      if (state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle].intensity = intensity;
      }
      state.gpu.scalarVolumeRenderer?.setIntensity(handle, intensity);
      state.subsystems.scheduler.requestRender();
    },

    setVolumeFieldContrast(handle, contrast) {
      // Same shape as setVolumeFieldIntensity: mirror to the settings
      // bag for optimistic UI, forward to the renderer which clamps to
      // its safe range.  No-op on unknown handle; the renderer
      // tolerates that too.
      if (state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle].contrast = contrast;
      }
      state.gpu.scalarVolumeRenderer?.setContrast(handle, contrast);
      state.subsystems.scheduler.requestRender();
    },

    setVolumeFieldDensityScale(handle, value) {
      // Identical shape to setVolumeFieldContrast: mirror to the
      // settings bag first (so optimistic React reads see the raw
      // value), then forward to the renderer which clamps negative /
      // NaN inputs to 0.  No-op on unknown handle.  The renderer
      // tolerates a no-op call before it's constructed via the `?.`
      // chain — same forgiving pattern as the rest of this surface.
      if (state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle].densityScale = value;
      }
      state.gpu.scalarVolumeRenderer?.setDensityScale(handle, value);
      state.subsystems.scheduler.requestRender();
    },

    listVolumeFields() {
      // Delegates to the renderer, which is the authoritative list.
      // Falls back to [] when the renderer is not yet constructed.
      return state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
    },

    getVolumeFieldsState() {
      // Combines the ordered handle list from the renderer with the
      // per-field settings bag — avoiding the need to expose internal
      // state to the React layer.  We pull the human-readable label
      // from `VOLUME_FIELD_DEFAULTS` when the registry has one, so
      // the panel shows "CF-4 DM density" instead of "cf4-density";
      // unregistered handles still fall back to the raw string.
      const handles = state.gpu.scalarVolumeRenderer?.listHandles() ?? [];
      return handles.map((handle) => {
        const field = state.settings.volumeFields[handle];
        const defaults = getVolumeFieldDefaults(handle);
        return {
          handle,
          label: defaults.label ?? handle,
          enabled: field?.enabled ?? true,
          intensity: field?.intensity ?? DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: field?.contrast ?? defaults.contrast,
          densityScale: field?.densityScale ?? defaults.densityScale,
          paletteId: field?.paletteId ?? DEFAULT_VOLUME_PALETTE_ID,
        };
      });
    },

    setVolumeFieldPalette(handle, id) {
      // Mirror into the settings bag so optimistic React reads see the
      // new value before the next frame.  The renderer's setFieldPalette
      // is a single GPU queue.writeTexture; the field's bind group stays
      // valid because the palette texture is never recreated.
      if (state.settings.volumeFields[handle]) {
        state.settings.volumeFields[handle].paletteId = id;
      }
      state.gpu.scalarVolumeRenderer?.setFieldPalette(handle, id);
      state.subsystems.scheduler.requestRender();
    },

    // ── SpaceMouse 6DOF input setters ─────────────────────────────────────
    //
    // Thin pass-throughs to the subsystem.  The lazy-construction and
    // axes-cache management both live inside `spaceMouseSubsystem.ts`;
    // here we just unwrap the `{ ok }` envelope to keep the public
    // EngineHandle type unchanged (Promise<boolean>).

    async connectSpaceMouse() {
      const result = await state.subsystems.spaceMouse.connect();
      return result.ok;
    },

    disconnectSpaceMouse() {
      state.subsystems.spaceMouse.disconnect();
      // Wake one frame so the still-animating predicate sees the
      // freshly-zeroed axes and lets the loop sleep cleanly.
      state.subsystems.scheduler.requestRender();
    },

    isSpaceMouseConnected() {
      return state.subsystems.spaceMouse.isConnected();
    },

    setSpaceMouseSensitivity(value) {
      state.subsystems.spaceMouse.setSensitivity(value);
    },

    // ── Asset-slot registry (dev-panel surface) ──────────────────────────
    //
    // `allSlots` is declared at outer scope and populated by the GPU init
    // IIFE.  Exposing the same Map reference here means the dev panel
    // observes new slots as they appear (the `LoadingDevPanel`'s effect
    // re-subscribes whenever the prop identity changes — but since we
    // hand it a stable reference, it instead picks up new slots on the
    // first render that runs after the IIFE populates them, then
    // subscribes once at that point).  Read-only at the type level so
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
