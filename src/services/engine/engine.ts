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
 * `onSelectChange`, and `onScaleChange` only when values *actually change*, so
 * the React side can call `setState` directly without worrying about spurious
 * re-renders.
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
 *   - `scaleBar.ts`            — pure scale-bar tick selection + label formatting
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
 *   onScaleChange:  (sc) => setScale(sc),
 * });
 *
 * // later (e.g. React cleanup):
 * handle.destroy();
 * ```
 */

import { updatePosition } from '../camera/orbitCamera';
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
} from '../../data/defaults';
import type { LodMode, PointCloud, PointInfo } from '../../@types';
import type { EngineCallbacks, EngineHandle, EngineState } from '../../@types';
import { vec3 } from 'gl-matrix';

import { createTweenManager } from './camera/tweenManager';
import { createRenderScheduler } from './subsystems/renderScheduler';
import { createSelectionSubsystem } from './subsystems/selectionSubsystem';
import { createBiasCorrectionSubsystem } from './subsystems/biasCorrectionSubsystem';
import { createFpsCounter } from './subsystems/fpsCounter';
import { buildPointInfo } from './helpers/pointInfoBuilder';
import { commitFocus } from './helpers/commitFocus';
import { logCameraState } from './helpers/logCameraState';
import type { AssetSlot } from '../loading/types';
import { awaitSlotReady } from '../loading/awaitSlotReady';
import { type PgcAliasMap } from '../loading/fetchers/pgcAliasFetcher';
import { TIER_TARGETS } from '../../data/tierTargets';
import { FOCUS_TWEEN_MS } from './camera/focusTween';

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
 *   5. `cb.onHoverChange`, `cb.onSelectChange`, `cb.onScaleChange` fire during
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
  // resources (device, context, quadRenderer, diskRenderer) that
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
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnlyMode: DEFAULT_REAL_ONLY_MODE,
      depthFadeEnabled: DEFAULT_DEPTH_FADE_ENABLED,
      exposure: DEFAULT_EXPOSURE,
      toneMapCurve: DEFAULT_TONE_MAP_CURVE,
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
          cb.onSpaceMouseConnectedChange?.(connected);
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

  cb.onStatusChange({ kind: 'initializing' });

  // ── Bootstrap dependency bag ─────────────────────────────────────────────
  //
  // The four bootstrap phases (`initGpu`, `wireSlots`, `wireInput`,
  // `startLoop`) live in `phases/*.ts` and consume a shared
  // `BootstrapDeps` object built here.  Anything the pre-Phase-5 IIFE
  // captured from createEngine's outer scope flows through this bag —
  // the canvas + cb args, the `{current}` ref boxes for forward-declared
  // bindings (frameRef, detachControlsRef, handleRef), the createEngine-
  // scope helpers (cssToTexPx, updateScaleBar), and the values needed
  // for `RunFrameDeps` assembly in `startLoop`
  // (fpsCounter, lastReportedFps, allSlots).
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
    } catch (err) {
      // Surface initialisation failures via the status callback so the UI
      // shows a readable message rather than a blank canvas.
      const message = err instanceof Error ? err.message : String(err);
      cb.onStatusChange({ kind: 'error', message });
      console.error('Engine startup failed:', err);
    }
  })();

  // ── Public handle ─────────────────────────────────────────────────────────

  const handle: EngineHandle = {
    clearSelection() {
      // Only fire the callback when something was actually selected.
      // This lets the Esc handler in App.tsx call this unconditionally.
      if (state.subsystems.selection.selected() !== null) {
        state.subsystems.selection.setSelected(null);
        // Clearing the pin also clears the camera-focus target — Esc /
        // close ✕ are explicit "I'm done with this galaxy" signals.
        cb.onFocusChange?.(null);
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
    // `satisfies` here is the safety net the settingsTable docstring
    // advertises: if the builder's return shape ever drifts away from
    // `Pick<EngineHandle, SettingsTableKey>` (e.g. a renamed key, or
    // a value type that's not assignable due to contravariance), tsc
    // catches it at this spread site rather than at distant callers.
    ...(buildSettersFromTable(state, cb, () =>
      state.subsystems.scheduler.requestRender(),
    ) satisfies Pick<EngineHandle, SettingsTableKey>),

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
      state.bias.mode = mode;
      cb.onBiasModeChange?.(mode);
      void state.subsystems.biasCorrection.setMode(mode);
      state.subsystems.scheduler.requestRender();
    },

    resetCamera() {
      // `state.cam` may be null if the engine is destroyed or the cloud
      // hasn't loaded yet.  We keep `state.initialCamSnapshot` declared in the
      // outer state bag (rather than scoped to the async IIFE) so that
      // this handle method can read it after the IIFE completes.
      // Reading `state.cam` at call time gives us the live camera object
      // to mutate, not a stale snapshot.
      const cam = state.cam;
      const initialCamSnapshot = state.initialCamSnapshot;
      if (!cam || !initialCamSnapshot) return;
      cam.target[0] = initialCamSnapshot.target[0];
      cam.target[1] = initialCamSnapshot.target[1];
      cam.target[2] = initialCamSnapshot.target[2];
      cam.distance = initialCamSnapshot.distance;
      cam.yaw = initialCamSnapshot.yaw;
      cam.pitch = initialCamSnapshot.pitch;
      updatePosition(cam);
      state.subsystems.scheduler.requestRender();
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
      // Camera or initial snapshot may not be ready yet — same pattern as
      // resetCamera.  Both must exist for a meaningful tween.
      const cam = state.cam;
      const initialCamSnapshot = state.initialCamSnapshot;
      if (!cam || !initialCamSnapshot) return;

      // Returning to the home view means we're no longer focused on any
      // particular galaxy.  Notify so the URL clears its `#focus=…`.
      cb.onFocusChange?.(null);

      state.subsystems.tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(
          initialCamSnapshot.target[0],
          initialCamSnapshot.target[1],
          initialCamSnapshot.target[2],
        ),
        fromDistance: cam.distance,
        toDistance: initialCamSnapshot.distance,
        fromYaw: cam.yaw,
        toYaw: initialCamSnapshot.yaw,
        fromPitch: cam.pitch,
        toPitch: initialCamSnapshot.pitch,
      });
      state.subsystems.scheduler.requestRender();
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
      cb.onLodModeChange?.(mode);
      state.subsystems.scheduler.requestRender();
    },

    setSourceVisible(source, visible) {
      // A user explicitly toggling one survey is the strongest possible
      // signal that they want manual control.  Auto-LOD would clobber the
      // mask on the very next frame, so we proactively flip into manual
      // mode here rather than making the caller orchestrate two calls.
      if (state.sources.lodMode !== 'manual') {
        state.sources.lodMode = 'manual';
        cb.onLodModeChange?.('manual');
      }

      const next = visible
        ? maskWith(state.sources.visibleMask, source)
        : maskWithout(state.sources.visibleMask, source);
      if (next === state.sources.visibleMask) return;
      state.sources.visibleMask = next;
      cb.onSourceMaskChange?.(next);
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
      cb.onTierChange?.(tier);

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
