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
 * Hover state, selection state, the renderer/picker/HDR handles, and the
 * orbit-controls attachment stay inline here because they share closure
 * with React-callback boundaries (setHovered/setSelected) or require
 * `cam` (which doesn't exist until the async IIFE runs).
 *
 * ### Usage
 *
 * ```ts
 * const handle = createEngine(canvas, {
 *   onStatusChange: (s) => setStatus(s),
 *   onHoverChange:  (p) => setHovered(p),
 *   onSelectChange: (p) => setSelected(p),
 *   onScaleChange:  (sc) => setScale(sc),
 * });
 *
 * // later (e.g. React cleanup):
 * handle.destroy();
 * ```
 */

import { initGpu, resizeCanvasToDisplay } from '../gpu/device';
import { PointRenderer } from '../gpu/pointRenderer';
import { createPickRenderer } from '../gpu/pickRenderer';
import { createHdrTarget } from '../gpu/hdrTarget';
import { createToneMapPass } from '../gpu/toneMapPass';
import { createOrbitCamera, computeViewProj, updatePosition } from '../camera/orbitCamera';
import { attachOrbitControls } from '../camera/orbitControls';
import { Source, maskWith, maskWithout } from '../../data/sources';
import { BiasMode } from '../../data/biasMode';
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

import { autoLodMask } from './autoLod';
import { createTweenManager } from './tweenManager';
import { createRenderScheduler } from './renderScheduler';
import { createFpsCounter } from './fpsCounter';
import { buildPointInfo, maxAbsCoord } from './pointInfoBuilder';
import { computeInitialCamera } from './cameraFraming';
import { seedSettingsCallbacks } from './seedSettingsCallbacks';
import { computeScaleInfo } from './scaleBar';
// The legacy load-orchestration surface (`loadAllClouds`, `reloadSource`,
// `loadFilaments`, `buildSyntheticFallback`, `LoadEvent`) lived in the
// now-deleted `cloudLoader.ts`.  Tasks 9 and 10 ported every runtime
// call site to the AssetSlot machinery; Task 12 finished the cleanup
// by deleting cloudLoader outright.
import { cloudSourceFor } from '../../data/cloudSource';
import { createLoadProgressEmitter } from './loadProgressAggregator';
import type { AssetSlot } from '../loading/types';
import { createAssetSlot } from '../loading/AssetSlot';
import { pointCloudFetcher } from '../loading/fetchers/pointCloudFetcher';
import { filamentFetcher } from '../loading/fetchers/filamentFetcher';
import { famousMetaFetcher } from '../loading/fetchers/famousMetaFetcher';
import { pgcAliasFetcher, type PgcAliasMap } from '../loading/fetchers/pgcAliasFetcher';
import { generateSyntheticCloud } from '../../data/synthetic';
import { TIER_TARGETS } from '../../data/tierTargets';
import { FOCUS_TWEEN_MS, focusDistanceMpc } from './focusTween';

// ── Galaxy thumbnail subsystem ────────────────────────────────────────────
//
// The whole pipeline (atlas + priority queue + per-frame loop + sorting
// + back-to-front draw) lives in `thumbnailSubsystem.ts`.  Engine-side
// we just instantiate it, hand it the QuadRenderer + DiskRenderer
// references, and call `runFrame()` once per tick (gated on the
// galaxyTexturesEnabled toggle).  See that module's docstring for the
// rationale on why-a-subsystem and the retry-storm contract.
import { QuadRenderer } from '../gpu/quadRenderer';
import { DiskRenderer } from '../gpu/diskRenderer';
import { ProceduralDiskRenderer } from '../gpu/proceduralDiskRenderer';
import { MilkyWayRenderer } from '../gpu/milkyWayRenderer';
import { FilamentRenderer } from '../gpu/filamentRenderer';
import {
  createThumbnailSubsystem,
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from './thumbnailSubsystem';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem (WebHID device handle, axes-cache, dt-baseline,
// sensitivity scalar, per-frame camera mutation) lives in
// `spaceMouseSubsystem.ts`.  Engine-side we just instantiate it once,
// pass it `cancelTween` / `onAxes` / `onConnectionChange` callbacks,
// and call `applyToCamera()` from `frame()`.  The handle's
// connect/disconnect/sensitivity setters forward straight through.
import { createSpaceMouseSubsystem } from './spaceMouseSubsystem';
import { createClickResolver } from './clickHandler';
import { attachEngineInputs } from './inputBindings';
import { renderFrame } from './renderFrame';

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
/**
 * Lowercase short name for a Source — used as the stable prefix for
 * asset-slot identifiers (e.g. `sdss-points`, `glade-points`).  We keep
 * a small dedicated helper rather than reusing `sourceLabel` because
 * the latter returns the user-facing display string ('GLADE',
 * 'Famous'), while slot names live in logs / progress keys / dev
 * tooling and benefit from being lowercase + ASCII-clean.
 *
 * Defined at module scope so the per-source slot-construction loop
 * inside `createEngine` can use it without re-declaring on every
 * engine boot.
 */
function sourceName(source: Source): string {
  switch (source) {
    case Source.SDSS:
      return 'sdss';
    case Source.TwoMRS:
      return '2mrs';
    case Source.Glade:
      return 'glade';
    case Source.Famous:
      return 'famous';
    case Source.Synthetic:
      return 'synthetic';
  }
}

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
  //                    bake at `applySchechterMode` /
  //                    `applyAngularReweightMode`).
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
  // The render loop's `frame()` body lives further down inside the async
  // IIFE, because it reads GPU resources (device, context, quadRenderer,
  // diskRenderer) that initGpu() returns asynchronously.  But the
  // `RenderScheduler` we wire into `state.subsystems.scheduler` needs an
  // `onFrame` callback at construction time — which is *here*, in the
  // synchronous state literal below.
  //
  // We resolve the chicken-and-egg by forward-declaring `frame` as a
  // `let` initialised to a no-op stub.  The state literal's scheduler
  // captures the local `frame` *binding* (via the `() => frame()`
  // closure) rather than the current value, so when the IIFE later
  // assigns `frame = () => { /* real body */ }`, every subsequent rAF
  // invocation runs the real body.
  //
  // Why this is the architectural fix to the previous "shim captured by
  // reference" bug: with this pattern, `state.subsystems.scheduler`
  // is the *real* `RenderScheduler` from the moment `state` is
  // constructed.  Anyone who captures it by reference — including
  // `attachEngineInputs` — gets the live scheduler immediately.  No
  // shim, no proxy, no post-init reassignment.  The only thing
  // deferred is the *frame body*, and that's deferred safely via a
  // closure that reads the latest binding lazily.
  //
  // The stub is silently a no-op rather than a logging warning
  // because its only invocation window is "rAF fires before the IIFE
  // finishes wiring `frame`" — vanishingly rare (the user would have
  // to interact with the canvas in the first ~milliseconds of
  // startup), and harmless even if it does fire.
  let frame: () => void = () => {
    /* stub until IIFE assigns the real body — see comment above */
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
  let lastReportedFps: number | null = null;

  /**
   * Wall-clock epoch (ms, from `performance.now`) snapshot taken at
   * engine construction.  Per-frame the Milky Way impostor's iTime
   * is computed as `(performance.now() - milkyWayITimeEpochMs) * 0.001 *
   * 0.25` — outer factor `0.25` is the slow-but-alive animation scale
   * decided in the plan.  See `shaders/milkyWayImpostor.wgsl` line
   * tagged `Match the ShaderToy's TIME macro` for the inner `* 0.1`
   * factor that runs on top of this.
   */
  const milkyWayITimeEpochMs = performance.now();

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
      hoveredIndex: null,
      selectedIndex: null,
      latestMouseCss: null,
      lastPickedMouseCss: null,
      pickInFlight: false,
      pointerDown: false,
    },
    gpu: {
      // All four GPU handles populate during the async IIFE below
      // and release in `destroy()`.  See `@types/EngineGpuHandles.d.ts`
      // for the null-until-init lifecycle rationale.
      renderer: null,
      pickRenderer: null,
      hdrTarget: null,
      toneMapPass: null,
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
      scheduler: createRenderScheduler({ onFrame: () => frame() }),

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

  /**
   * Resolve a global instance ID coming back from the picker into the
   * (source, local index) pair that lets us look the point up in `clouds`.
   *
   * Walks the renderer's loaded sources in `Source`-enum order, subtracting
   * each survey's count from the running global ID until the remainder
   * falls inside the current source's range.  This is the inverse of the
   * renderer's `instanceIdOffset` calculation in `pointRenderer.ts`.
   *
   * Returns `null` when the global ID lies past the end of every loaded
   * source (defensive — should not happen if the picker only returns
   * indices it actually drew).
   */
  function resolveGlobalIdx(globalIdx: number): { source: Source; localIdx: number } | null {
    if (!state.gpu.renderer) return null;
    let remaining = globalIdx;
    for (const entry of state.gpu.renderer.loadedSources()) {
      if (remaining < entry.count) {
        return { source: entry.source, localIdx: remaining };
      }
      remaining -= entry.count;
    }
    return null;
  }

  /** Build a PointInfo from a global picker index, or null if unresolvable. */
  function pointInfoFromGlobal(globalIdx: number) {
    const resolved = resolveGlobalIdx(globalIdx);
    if (!resolved) return null;
    const c = state.sources.clouds.get(resolved.source);
    if (!c) return null;
    // Bounds-check against the cloud's actual count.  During a tier swap
    // there's a transient window where the renderer's per-source count
    // and the engine's clouds map can disagree (e.g. the renderer just
    // re-uploaded a smaller cloud but a still-in-flight pick from a
    // previous frame returns a global idx encoded against the older,
    // larger layout).  Without this guard, buildPointInfo would index
    // past the end of cloud.magG / cloud.axisRatio / etc. and produce
    // a PointInfo whose numeric fields are runtime-undefined — which
    // crashes downstream `.toFixed()` calls in the InfoCard.  Returning
    // null here is the right semantics: "we don't have data for that
    // pick; render no card, the next frame's pick will succeed".
    if (resolved.localIdx >= c.count) return null;
    return buildPointInfo(
      c,
      resolved.localIdx,
      resolved.source,
      state.sources.famousMeta,
      state.sources.famousXrefs,
    );
  }

  // ── Cleanup function returned by `attachOrbitControls` ─────────────────
  // Orbit-controls attachment lives outside `inputBindings` because it
  // needs a fully-constructed OrbitCamera which doesn't exist at
  // engine() time — see inputBindings.ts's docstring.  This handle is
  // a transient local rather than engine state because it's a single
  // teardown function with no other consumers.
  let detachControls: (() => void) | null = null;

  // ── Scale-bar deduplication ──────────────────────────────────────────────
  //
  // We only fire `onScaleChange` when the formatted label or rounded pixel
  // width actually changes.  A string signature (`"${niceMpc}:${widthPx}"`)
  // is the cheapest dedup — one string comparison per frame.  Both
  // bindings stay local because they're scoped to `updateScaleBar()`.
  const SCALE_TARGET_PX = 150;
  let lastScaleSig = '';

  // ── CSS → texture-space pixel conversion ────────────────────────────────
  //
  // DPR cap matches `resizeCanvasToDisplay` in device.ts (≤ 2). Precomputed
  // once here; if DPR changes (rare) the next pick will use the stale cap —
  // acceptable, a refresh resolves it.
  function cssToTexPx(cssPx: number): number {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return cssPx * dpr;
  }

  // ── Hover / selection state helpers ─────────────────────────────────────

  /**
   * Notify the UI if the hovered point changed.
   *
   * We compare old vs. new index before firing to avoid triggering a React
   * re-render on every frame when nothing changed.
   */
  function setHovered(idx: number | null): void {
    if (idx === state.picking.hoveredIndex) return;
    state.picking.hoveredIndex = idx;
    cb.onHoverChange(idx !== null ? pointInfoFromGlobal(idx) : null);
  }

  /**
   * Notify the UI if the selected point changed.
   */
  /**
   * Update the live selection.
   *
   * The optional `prebuiltInfo` parameter is for callers that already
   * hold the `PointInfo` for this index — typically `selectByAlias`,
   * which builds the info from the data-side cloud store BEFORE the
   * GPU upload has settled.  In that window, `pointInfoFromGlobal`
   * (which reads from `state.gpu.renderer.loadedSources()`) can return
   * `null` because the renderer doesn't know about the source yet,
   * even though the data-side `state.sources.clouds` does.  Passing
   * the prebuilt info bypasses that race so the React-side selection
   * updates correctly while the GPU is still settling — the halo will
   * appear once the upload completes a frame or two later.
   */
  function setSelected(idx: number | null, prebuiltInfo?: PointInfo | null): void {
    if (idx === state.picking.selectedIndex) return;
    state.picking.selectedIndex = idx;
    const info =
      prebuiltInfo !== undefined
        ? prebuiltInfo
        : idx !== null
          ? pointInfoFromGlobal(idx)
          : null;
    cb.onSelectChange(info);
  }

  // ── Scale bar computation ────────────────────────────────────────────────

  /**
   * Compute the scale bar's label and pixel width from the current camera
   * state, then fire `onScaleChange` if either value changed.
   *
   * The pure math (perspective-projection → pxPerMpc → niceRound → label)
   * lives in `scaleBar.ts:computeScaleInfo`.  This wrapper owns the engine-
   * frame-local concerns:
   *
   *   - Reading the live `cam` reference (initialised post-async).
   *   - Reading `canvas.clientHeight` (CSS pixels, not backing-store) so
   *     the bar's physical screen width is DPR-independent.
   *   - Deduplicating identical results via `lastScaleSig` so React's
   *     setState only fires when the user-visible value actually changed.
   */
  function updateScaleBar(): void {
    if (!state.cam) return;

    const info = computeScaleInfo({
      cam: state.cam,
      canvasSize: { width: canvas.clientWidth, height: canvas.clientHeight },
      targetPx: SCALE_TARGET_PX,
    });
    if (info === null) return;

    const sig = `${info.label}:${info.widthPx}`;
    if (sig === lastScaleSig) return;
    lastScaleSig = sig;

    cb.onScaleChange(info);
  }

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

  // The main async IIFE runs GPU init + data load, then kicks off the render
  // loop. All errors are caught here and reported via `onStatusChange`.
  (async () => {
    try {
      // Sync the backing store to the display size *before* handing the canvas
      // to WebGPU — otherwise `getCurrentTexture()` may return a 300×150 default.
      resizeCanvasToDisplay(canvas);

      const { device, context, format } = await initGpu(canvas);

      // ── HDR offscreen target + tone-map post-process ──────────────────
      //
      // Every visible draw pass (points, quads, disks) writes into a
      // viewport-sized rgba16float texture instead of the swap chain.  At
      // the end of the frame, the tone-map pass samples the HDR target
      // and writes tone-mapped, compressed-into-[0,1] values into the
      // swap chain.  This eliminates the saturated-white "blown-out"
      // cluster cores that pure additive blending into bgra8unorm
      // suffers from, and gives the user a runtime curve selector so
      // they can compare Linear / Reinhard / Asinh / Gamma 2 / ACES
      // (see `data/toneMapCurve.ts`).
      //
      // The HDR target is recreated on resize (further down in the
      // frame loop's resize branch) so it always tracks the swap chain
      // size 1:1 — that's also why the tone-map sampler uses 'nearest'
      // filtering (each fragment samples a single texel).
      //
      // Pick renderer is unaffected — its r32uint integer target is
      // separate and never wants tone-mapping.  See
      // `docs/superpowers/plans/2026-05-04-hdr-tonemap.md` for the full
      // rationale.
      const hdrTarget = createHdrTarget(device, {
        width: canvas.width,
        height: canvas.height,
      });
      const toneMapPass = createToneMapPass(device, format);
      // Mirror into the engine state so `destroy()` (defined on the
      // public handle, outside this IIFE) can release the GPU resources.
      state.gpu.hdrTarget = hdrTarget;
      state.gpu.toneMapPass = toneMapPass;

      // Build the GPU pipeline; cloud data is loaded below.
      // PointRenderer (and QuadRenderer/DiskRenderer further down) target
      // the HDR rgba16float texture instead of the swap-chain `format`.
      // Their pipelines bake this into a fixed colour-target descriptor at
      // construction time, so the format choice has to land here.
      const renderer = new PointRenderer(device, 'rgba16float');
      state.gpu.renderer = renderer;

      // ── Per-source asset slots (Task 8 SDSS, Task 9 the rest) ────────────
      //
      // Every survey now flows through `createAssetSlot`.  The slot owns
      // one cell of mutable state (its current LoadState) and exposes
      // the fetch→commit lifecycle behind a race-checked façade — see
      // `AssetSlot.ts`'s header for the full why-and-how, especially
      // the two race-check points that fix the tier-swap stomping bug.
      //
      // Why construct here, after the renderer exists?
      //   The commit step uploads the freshly-decoded PointCloud to
      //   `state.gpu.renderer`, so the renderer must be non-null at the
      //   moment commit runs.  Constructing the slots AFTER
      //   `state.gpu.renderer = renderer` in the same lexical scope
      //   makes that ordering obvious to anyone reading top-down.  An
      //   alternative would be to lazily build slots inside setTier on
      //   first call, but that splits one cohesive subsystem across
      //   two files.
      //
      // Why `await renderer.upload(...)` inside commit?
      //   The slot fires its `committed` event (which transitions the
      //   state to `ready`) only after `commit` resolves.  Awaiting the
      //   GPU upload here — rather than fire-and-forget — guarantees
      //   that subscribers seeing `kind === 'ready'` can rely on the
      //   GPU buffer being populated, which is the primary contract the
      //   asset-loading rework is delivering.  This is also what closes
      //   the race window the old `loadAllClouds` path papered over with
      //   an out-of-band `uploadChain` promise.
      //
      // Why `requestRender()` in the subscriber?
      //   The render loop is gated on `requestRender` — without an
      //   explicit wake-up the new GPU buffer would sit unrendered until
      //   the user nudged the camera.  Firing it on the `ready`
      //   transition (rather than inside `commit`) keeps the slot's
      //   commit step pure of UI concerns; the wake-up is a downstream
      //   side-effect of the slot's state transition, not part of the
      //   commit contract.
      //
      // Naming: `<source>-points` for survey clouds, `filaments` for
      // filaments.  The progress aggregator keys on these strings, so
      // they double as the load-progress identifier.
      for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
        const slotName = `${sourceName(source)}-points`;
        const slot = createAssetSlot({
          name: slotName,
          fetch: pointCloudFetcher,
          commit: async (cloud) => {
            // Renderer might have been destroyed mid-load (StrictMode
            // unmount, hot-reload).  Drop the upload silently in that
            // case; the slot will still transition to `ready`, but no
            // GPU buffer exists to consume it.
            if (!state.gpu.renderer) return;
            const t0 = performance.now();
            // eslint-disable-next-line no-console
            console.log(
              `[engine] upload start ${sourceName(source)} count=${cloud.count}`,
            );
            await state.gpu.renderer.upload(source, cloud);
            state.sources.clouds.set(source, cloud);
            const dtMs = Math.round(performance.now() - t0);
            // After upload, dump what the GPU actually has — the source
            // of truth the draw loop reads from.  If this disagrees with
            // the slot's reported `cloud.count`, the upload landed on the
            // renderer but something else (e.g. a parallel rebake or a
            // concurrent upload for the same source) overwrote it.
            const onGpu = Array.from(state.gpu.renderer.loadedSources())
              .map((e) => `${sourceName(e.source)}=${e.count}`)
              .join(', ');
            const total = state.gpu.renderer.totalCount();
            // eslint-disable-next-line no-console
            console.log(
              `[engine] upload done  ${sourceName(source)} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
            );
          },
        });
        slot.subscribe((s) => {
          // Per-slot byte-count plumbing into the loading-bar aggregator
          // is gone post-Task-12 — the new `createLoadProgressEmitter`
          // recomputes from `aggregateRegistry(slots)` on every state
          // change, so this subscriber only needs to fire the
          // app-visible side effects (cb echo + render wake).
          if (s.kind === 'ready') {
            cb.onCloudReady?.(source, s.value.count);
            state.subsystems.scheduler.requestRender();
          }
        });
        state.assetSlots.points.set(source, slot);
      }

      // ── Galaxy thumbnail subsystem ─────────────────────────────────────
      //
      // Three collaborators wired together here:
      //
      //   - thumbnails:   owns the atlas (GPU texture + slot LRU), the
      //                   priority queue, and the per-frame loop that
      //                   allocates slots, kicks off fetches, and emits
      //                   sorted Quad/Disk instances.  See
      //                   `thumbnailSubsystem.ts` for the why-and-how.
      //   - quadRenderer: textured-quad render pass running after the
      //                   point pass each frame.  Engine owns it
      //                   directly (rather than the subsystem) because
      //                   future passes (selection halo) may share it.
      //   - diskRenderer: 3D-oriented disk variant for large galaxies.
      //                   Same ownership story as quadRenderer.
      //
      // `galaxyTexturesEnabled` is mutated by the SettingsPanel toggle.
      // The engine simply skips `thumbnails.runFrame()` when the toggle
      // is off — the LRU clock pauses with it, which is fine because
      // nothing else reads it while the toggle is off.
      //
      // The QuadRenderer/DiskRenderer constructors want a GpuContext;
      // we build them with the four constituents in scope rather than
      // restructuring initGpu's return signature.

      // QuadRenderer targets the HDR offscreen texture (see the rationale
      // at PointRenderer construction above) — it composites galaxy
      // thumbnails into the same accumulated linear-light buffer the
      // points pass writes into.
      const quadRenderer = new QuadRenderer({
        device,
        context,
        format: 'rgba16float',
        canvas,
      });
      // DiskRenderer shares the same atlas as QuadRenderer — both pull from
      // the same 2048×2048 thumbnail texture.  The engine routes each
      // galaxy to one renderer or the other per frame based on apparent
      // size and orientation-data availability (see the per-frame loop).
      const diskRenderer = new DiskRenderer({
        device,
        context,
        format: 'rgba16float',
        canvas,
      });
      // ProceduralDiskRenderer fills the visibility gap between the
      // screen-aligned point glow (which goes pixelated above ~8 px) and
      // the textured-disk pass (which only kicks in at 24 px).  In the
      // 8-14 px band both the points pass and this renderer are active,
      // crossfading via complementary smoothstep alphas (see
      // PROCEDURAL_DISK_FADE_START_PX / _END_PX in thumbnailSubsystem.ts).
      // Same HDR target as the other thumbnail-pass renderers so the
      // procedural disk composites into the same linear-light buffer.
      const proceduralDiskRenderer = new ProceduralDiskRenderer({
        device,
        context,
        format: 'rgba16float',
        canvas,
      });
      // Procedural Milky Way impostor at world origin.  See
      // `services/gpu/milkyWayRenderer.ts` for the rationale on why this
      // is a sibling renderer rather than tucked into the per-galaxy
      // procedural-disk pass, and `utils/math/milkyWayFade.ts` for the
      // distance-fade band.
      const milkyWayRenderer = new MilkyWayRenderer({
        device,
        format: 'rgba16float',
      });
      // ── Cosmic-web filament-skeleton renderer ─────────────────────────
      //
      // Built unconditionally (the pipeline / quad VBO / uniform buffer
      // are cheap), but the per-instance buffer is populated only after
      // `loadFilaments()` resolves with a non-null cloud — i.e. when the
      // optional `filaments.bin` exists.  When the binary is absent
      // (fresh clone before `npm run build-filaments`), `upload` is
      // simply never called and `draw` returns early on `segmentCount=0`.
      //
      // Same HDR target as every other overlay so the additive
      // contribution accumulates in float-precision before tone mapping.
      const filamentRenderer = new FilamentRenderer(device, 'rgba16float');
      state.gpu.filamentRenderer = filamentRenderer;

      // ── Filament asset slot (Task 9) ─────────────────────────────────
      //
      // The cosmic-web skeleton flows through its own slot — different
      // fetcher (binary format is segments-not-points), different
      // renderer target (`filamentRenderer` rather than the per-source
      // `pointRenderer`), and a one-shot lifecycle: load() at boot,
      // never on tier change.
      //
      // Why one-shot?  Re-downloading the ~30 MB skeleton every tier
      // flip would tax bandwidth for a topology that barely differs
      // between tiers — see `filamentFetcher.ts`'s docblock for the
      // detailed rationale, including the "small-tier-on-desktop edge
      // case" trade-off.
      //
      // Why awaited `upload()` even though `FilamentRenderer.upload` is
      // synchronous?  `await undefined` is harmless and keeps the slot's
      // commit signature uniform with the per-source slots above; if a
      // future filament-renderer revision adds an async upload path
      // (e.g. compute-shader rebuild), this site needs no change.
      const filamentSlot = createAssetSlot({
        name: 'filaments',
        fetch: filamentFetcher,
        commit: async (cloud) => {
          if (!state.gpu.filamentRenderer) return;
          await state.gpu.filamentRenderer.upload(cloud);
        },
      });
      filamentSlot.subscribe((s) => {
        // Loading-bar plumbing is gone post-Task-12 — the emitter
        // recomputes from `aggregateRegistry(slots)` on every state
        // change.  This subscriber only fires the app-visible side
        // effects (counts echo + render wake) on the `ready` transition.
        if (s.kind === 'ready') {
          console.log(
            `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
          );
          // Push the parsed counts up to the UI layer.  See
          // `EngineCallbacks.onFilamentsReady` for the lifecycle rationale —
          // one-shot, fires only when the optional binary actually loaded.
          cb.onFilamentsReady?.(s.value.stripCount, s.value.vertexCount);
          state.subsystems.scheduler.requestRender();
        }
      });
      state.assetSlots.filaments = filamentSlot;

      // ── Famous-galaxy sidecar slot (Task 10) ─────────────────────────
      //
      // The two famous-galaxy JSON sidecars (`famous_meta.json` +
      // `famous_xrefs.json`) flow through one combined slot — the fetcher
      // pulls them in parallel and returns a `{ meta, xrefs }` payload.
      //
      // No `commit` step: there's nothing GPU-side to upload — the
      // payload is pure metadata consumed by the InfoCard via
      // `state.sources.famousMeta` / `state.sources.famousXrefs`.  The
      // subscriber writes both fields and wakes one frame so the
      // famous-galaxy thumbnails referenced by the cross-match xrefs
      // become enqueueable from the per-frame loop without the user
      // having to nudge the camera.
      //
      // **Graceful degradation on error.**  The old `loadFamousSidecars`
      // returned empty values when either file 404'd; the new fetcher
      // throws on HTTP failure (so the retry policy distinguishes "really
      // gone" from "transient flake"), and the slot subscriber maps
      // `kind: 'error'` → "feature off" by writing empty `meta`/`xrefs`.
      // Net effect for the user is identical to the pre-slot behaviour:
      // famous galaxies render without enriched InfoCard text, but the
      // engine keeps running.
      const famousMetaSlot = createAssetSlot({
        name: 'famous-meta',
        fetch: famousMetaFetcher,
      });
      famousMetaSlot.subscribe((s) => {
        if (s.kind === 'ready') {
          state.sources.famousMeta = s.value.meta;
          // GLADE local indices in the sidecar JSON now match the on-disk
          // binary directly — the cloudLoader no longer post-decodes
          // GLADE through a far-distance decimator (the data-tier system
          // owns point-count budgeting via its absolute-magnitude cut at
          // build time, which is a more principled rule and operates
          // BEFORE the binary is written, so xref indices stay valid).
          state.sources.famousXrefs = s.value.xrefs;
          state.subsystems.scheduler.requestRender();
        }
        if (s.kind === 'error') {
          // Match the old "absent file = feature off" behaviour exactly:
          // empty meta/xrefs disable the enriched InfoCard text but keep
          // the engine functional.  Defensive — these fields default to
          // `[]` / `{}` already, but writing them again here is explicit
          // about the contract.
          state.sources.famousMeta = [];
          state.sources.famousXrefs = {};
          console.warn('[engine] famous sidecars failed to load:', s.error);
        }
      });
      state.assetSlots.famousMeta = famousMetaSlot;

      // ── PGC-alias slot (Task 10) ─────────────────────────────────────
      //
      // The Cmd+K command palette's alias search needs `pgc_aliases.json`
      // (~1.7 MB).  Lazy: most users never hit Cmd+K, so paying the
      // download up front would be wasteful.  The slot is minted here for
      // lifecycle parity with every other asset, but `load()` is only
      // invoked through the public-handle's `loadPgcAliases()` shim on
      // first palette open.
      //
      // No `commit` — the resolved Map is consumed by the React layer via
      // the Promise the shim returns; nothing engine-side to mutate.
      const pgcAliasSlot = createAssetSlot({
        name: 'pgc-aliases',
        fetch: pgcAliasFetcher,
      });
      state.assetSlots.pgcAlias = pgcAliasSlot;

      // ── Loading-bar emitter ──────────────────────────────────────────
      //
      // Post-Task-12 the per-engine loading-bar aggregator is a thin
      // subscriber over `aggregateRegistry`.  Build the slot registry
      // here (now that every slot exists) and hand it to the emitter;
      // `attachSlot` then wires each slot's `subscribe` so that any
      // state transition recomputes the projection and forwards the
      // snapshot to `cb.onLoadProgress`.
      //
      // Why a single shared Map rather than four separate `attachSlot`
      // calls each owning their own subset?  The same registry also
      // feeds the dev panel's per-slot view (Task 13); building it
      // once here keeps both consumers in lock-step on what counts as
      // "in flight".
      //
      // The `unknown` type-erasure below is benign — `aggregateRegistry`
      // only reads `slot.state()` discriminator fields, never the
      // payload type.  We re-narrow at the dev panel's per-slot
      // rendering site if it cares.
      //
      // `allSlots` is declared at outer scope (top of `createEngine`) so
      // the public handle can expose the same Map as `assetSlots` for
      // the `LoadingDevPanel` debug component.  We populate it here once
      // every slot exists.
      for (const [, slot] of state.assetSlots.points) {
        allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
      }
      allSlots.set(filamentSlot.name, filamentSlot as unknown as AssetSlot<unknown, unknown>);
      allSlots.set(famousMetaSlot.name, famousMetaSlot as unknown as AssetSlot<unknown, unknown>);
      allSlots.set(pgcAliasSlot.name, pgcAliasSlot as unknown as AssetSlot<unknown, unknown>);

      const progressEmitter = createLoadProgressEmitter(
        (snapshot) => cb.onLoadProgress?.(snapshot),
        allSlots,
      );
      for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
      state.subsystems.loadProgress = progressEmitter;

      // Trigger the famous-meta load as soon as the slot is wired —
      // sidecars are tiny and only feed InfoCard text, so kicking them
      // off here (rather than awaiting the much larger point fetches)
      // means the very first hover already has enriched text on a typical
      // connection.  PGC-aliases stay lazy; see `loadPgcAliases()` on the
      // handle for the on-demand trigger.
      famousMetaSlot.load();

      // Build the subsystem and hand it the renderer references for
      // atlas-view binding.  The subsystem's `bindToRenderers` is split
      // out from its constructor because the renderers need to exist
      // first; building them here keeps the construction order linear.
      const thumbnails = createThumbnailSubsystem({
        device,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      });
      thumbnails.bindToRenderers(quadRenderer, diskRenderer, proceduralDiskRenderer);
      state.subsystems.thumbnails = thumbnails;

      // Signal loading state immediately so the user knows something is
      // happening before the (potentially multi-second) fetch completes.
      cb.onStatusChange({ kind: 'loading' });

      // ── Parallel multi-survey load via asset slots ────────────────────
      //
      // Each survey flows through its own `AssetSlot`.  The slot's
      // long-lived subscriber (wired at slot construction) handles
      // upload + `clouds.set` + `onCloudReady` + `requestRender` on
      // every transition to `ready` — so this block only has to fire
      // the loads and gate boot on "every slot has settled at least
      // once" before computing the camera bbox.
      //
      // **Why gate on all-settled rather than first-arrival?**  The
      // bbox loop below iterates `state.sources.clouds` to size the
      // camera's far plane.  If we framed on whichever survey arrived
      // first (typically 2MRS at ~2 MB / ~100 Mpc), GLADE's distant
      // galaxies (out to ~1.5 Gpc) would land outside the frustum and
      // never render — perceptually "the far plane has come closer".
      //
      // **Why track `pointsAnyReady` separately?**  The synthetic
      // fallback fires only when every *real* survey is empty/errored.
      // Famous is curated (~150 entries) and excluded from the
      // success/failure check both ways: a Famous-only success
      // shouldn't suppress synthetic, and a Famous-only failure
      // shouldn't trigger it.
      const REAL_POINT_SOURCES = [Source.SDSS, Source.TwoMRS, Source.Glade];
      const ALL_POINT_SOURCES = [...REAL_POINT_SOURCES, Source.Famous];
      let pointsAnyReady = false;
      let firstReadySource: Source | null = null;
      const allArrivalsPromise = new Promise<void>((resolve) => {
        let arrived = 0;
        for (const source of ALL_POINT_SOURCES) {
          const slot = state.assetSlots.points.get(source);
          if (!slot) {
            if (++arrived === ALL_POINT_SOURCES.length) resolve();
            continue;
          }
          let counted = false;
          const unsub = slot.subscribe((s) => {
            if (counted) return;
            if (s.kind === 'ready' && s.value.count > 0) {
              if (firstReadySource === null) firstReadySource = source;
              if (REAL_POINT_SOURCES.includes(source)) pointsAnyReady = true;
            }
            if (s.kind === 'ready' || s.kind === 'error') {
              counted = true;
              if (++arrived === ALL_POINT_SOURCES.length) resolve();
              unsub();
            }
          });
        }
      });

      for (const source of ALL_POINT_SOURCES) {
        state.assetSlots.points.get(source)?.load({ source, tier: state.sources.tier });
      }
      // Filaments load exactly once at boot — never on tier change.
      // See `filamentFetcher.ts` for the rationale.
      state.assetSlots.filaments?.load({ tier: state.sources.tier });

      await allArrivalsPromise;

      // Synthetic fallback — every real survey is empty/errored.  Drop
      // in a 100k procedural cloud so the user sees *something*.
      // Inline (rather than a subscriber) because boot is the only
      // place this can fire: tier swaps don't re-enter init, and
      // `pointsAnyReady` doesn't reset.
      if (!pointsAnyReady && state.gpu.renderer) {
        const synthetic = generateSyntheticCloud(100_000);
        await state.gpu.renderer.upload(Source.Synthetic, synthetic);
        state.sources.clouds.set(Source.Synthetic, synthetic);
        cb.onCloudReady?.(Source.Synthetic, synthetic.count);
        state.subsystems.scheduler.requestRender();
        firstReadySource = Source.Synthetic;
      }

      // Bail if no clouds reached the GPU (engine torn down mid-load,
      // or synthetic upload failed).  Without at least one cloud the
      // bbox computation below has nothing to size the camera against.
      if (state.sources.clouds.size === 0) return;

      // Build the pick renderer. It shares the same vertex/uniform buffers as
      // the visual renderer — no extra GPU memory for point data.
      const pickRenderer = createPickRenderer(device);
      state.gpu.pickRenderer = pickRenderer;
      // The resolver adapts the engine's existing per-global-idx
      // helpers (see `resolveGlobalIdx` and `pointInfoFromGlobal`
      // higher up) into the (cloud, localIdx, source) shape the
      // resolver wants.  The `cloud` lookup goes through the live
      // `state.sources.clouds` map so a cloud loaded after engine
      // init still picks up correctly.
      state.subsystems.clickResolver = createClickResolver({
        pickRenderer,
        resolveGlobalIdx: (globalIdx) => {
          const r = resolveGlobalIdx(globalIdx);
          if (!r) return null;
          const cloud = state.sources.clouds.get(r.source);
          if (!cloud) return null;
          // Same bounds-check as pointInfoFromGlobal — see its comment
          // for the tier-swap window that can produce out-of-range
          // localIdx values.
          if (r.localIdx >= cloud.count) return null;
          return { source: r.source, localIdx: r.localIdx, cloud };
        },
        buildPointInfo: (cloud, localIdx, src) =>
          buildPointInfo(cloud, localIdx, src, state.sources.famousMeta, state.sources.famousXrefs),
      });

      // ── Camera auto-framing ──────────────────────────────────────────────
      //
      // bbox = max abs coordinate across every loaded cloud.  Drives
      // the camera's far plane — must cover the deepest survey
      // (typically GLADE at ~1.5 Gpc).  `computeInitialCamera`
      // (cameraFraming.ts) turns it into target/distance/yaw/pitch
      // /near/far including the zoom-envelope clamp.
      let bbox = 0;
      for (const c of state.sources.clouds.values()) {
        const b = maxAbsCoord(c);
        if (b > bbox) bbox = b;
      }
      const fovYRad = (Math.PI / 180) * 60;
      const initialCam = computeInitialCamera({ bbox, fovYRad });

      const cam = createOrbitCamera({
        target: initialCam.target,
        distance: initialCam.distance,
        yaw: initialCam.yaw,
        pitch: initialCam.pitch,
        fovYRad: initialCam.fovYRad,
        aspect: canvas.width / canvas.height,
        near: initialCam.near,
        far: initialCam.far,
      });
      state.cam = cam;

      // ── Initial camera snapshot for resetCamera() ────────────────────────
      //
      // Capture the framing values now, after the cloud bbox is known, so
      // `resetCamera()` can restore them at any later time.  We mirror the
      // helper's output rather than re-reading from `cam` so future
      // reconfigures of the camera (e.g. user-driven FOV changes) don't
      // accidentally drift the reset target.  `aspect` is intentionally not
      // captured — reset uses the *current* canvas aspect so the projection
      // stays correct after a window resize.
      //
      // **Why we clone `target` into a fresh tuple:**
      //
      // `createOrbitCamera` does `{ ...init, position: vec3.create() }` —
      // a shallow spread.  That makes `cam.target` and `initialCam.target`
      // alias the SAME array object.  Every subsequent `focusOn()` /
      // tween-advance / orbit-pan call mutates `cam.target` in place via
      // vec3 ops, which also mutates `initialCam.target`.  By the time
      // `resetCamera()` later reads `state.initialCamSnapshot.target[0..2]`,
      // it's reading the most recently-focused galaxy's position back
      // into itself — i.e. the camera "resets" to whatever it was last
      // looking at, not to the catalog origin (the user-visible bug:
      // "reset camera resets the zoom level, but stays focussed on the
      // currently selected galaxy").
      //
      // Fixing it at the spread site (cloning inside `createOrbitCamera`)
      // would be the architecturally cleaner cure but ripples through the
      // OrbitCamera type contract; cloning *here* is a one-line fix that
      // restores the invariant `state.initialCamSnapshot` is meant to uphold.
      state.initialCamSnapshot = {
        ...initialCam,
        target: [initialCam.target[0], initialCam.target[1], initialCam.target[2]],
      };

      // ── Pointer / keyboard / resize listeners ────────────────────────────
      //
      // Centralised in `inputBindings.ts` so every DOM listener the
      // engine cares about lives in one module.  Each callback below
      // is the *semantic* engine action — the inputBindings module
      // already converts `e.clientX/Y` to a CSS-pixel record and
      // calls `scheduler.requestRender()` after every event so we
      // don't repeat that wake-up at every site.
      state.subsystems.inputBindings = attachEngineInputs({
        canvas,
        // Pass the scheduler by reference — safe because it was created
        // eagerly in the state literal above (the forward-declared
        // `frame` binding handles the chicken-and-egg between scheduler
        // construction and frame-body availability).
        scheduler: state.subsystems.scheduler,
        // Track latest mouse position for the per-frame throttled
        // hover pick.  The pick itself is async (1-2 frames later)
        // but its .then also calls requestRender so the selection
        // halo updates as soon as the readback lands.
        onPointerMove: (cssPx) => {
          state.picking.latestMouseCss = cssPx;
        },
        // Pointer left the canvas → clear hover state.  If a point
        // is selected the card stays visible (showing the pinned
        // point) — selection state is unaffected.
        onPointerLeave: () => {
          state.picking.latestMouseCss = null;
          setHovered(null);
        },
        // Manual orbit controls always win — cancel any running focus
        // tween the moment the user grabs the mouse.  Otherwise the
        // tween's updatePosition would fight the orbit-controls'
        // updatePosition for the same camera each frame, producing a
        // juddery jump.  Also clear hover so the card immediately
        // reflects "nothing hovered" instead of lagging until the
        // drag ends.
        onPointerDown: () => {
          state.subsystems.tweens.cancel();
          state.picking.pointerDown = true;
          setHovered(null);
        },
        onPointerUp: () => {
          state.picking.pointerDown = false;
        },
        // Esc clears selection.  App.tsx also has a useEffect that
        // forwards Esc through the engine handle's `clearSelection()`
        // — same result, both paths are fine.
        onEscape: () => {
          setSelected(null);
        },
        // resize: the next frame's resizeCanvasToDisplay() picks up
        // the new dimensions and recreates the HDR target.  All we
        // need to do is wake the loop, which inputBindings already
        // does via `scheduler.requestRender()` — so this callback is
        // a no-op.
        onResize: () => {},
      });

      // ── Click handling ───────────────────────────────────────────────────
      //
      // Click detection is delegated to `attachOrbitControls` via the `onClick`
      // option. A "click" fires only when pointerup is within 4 CSS pixels of
      // pointerdown — pure drags (orbit gestures) are suppressed.

      // Cache of the most-recent successful click pick.  The
      // double-click handler reads from this rather than running a
      // second pick: two readbacks racing on shared GPU resources
      // produced flaky results (the dblclick readback would resolve
      // first and return `clear` while the click's resolved later
      // with the real hit).  By reusing the click's PointInfo we
      // also save one readback per double-click.
      //
      // Stored as the full PointInfo so we can pull `x/y/z` and
      // `diameterKpc` straight into `handle.focusOn` without a
      // second cloud-lookup.  Cleared on every empty-space click so
      // a dblclick on empty space doesn't trigger a stale focus.
      let lastClickedInfo: PointInfo | null = null;

      // Shared pick body — used by single-click only now (dblclick
      // reuses the cached PointInfo).  Returns the click resolver's
      // result so the caller can decide what to do with it.  Inline
      // rather than module-level because it closes over `state`,
      // `canvas`, and the cssToTexPx helper from the surrounding
      // scope.
      const runPickAtCss = (
        xCss: number,
        yCss: number,
      ): ReturnType<NonNullable<typeof state.subsystems.clickResolver>['resolveClick']> | null => {
        const r = state.gpu.renderer;
        const cr = state.subsystems.clickResolver;
        if (!r || state.sources.clouds.size === 0 || !cr) return null;

        // Snapshot the renderer's per-source draw records and filter
        // by the current visibility mask so the pick pass sees the
        // same surveys the visual pass just rendered.  We materialise
        // to an array so the iterator survives the async pick promise.
        const visibleSources = Array.from(r.loadedSources()).filter(
          (s) => ((state.sources.visibleMask >> s.source) & 1) !== 0,
        );
        if (visibleSources.length === 0) return null;

        return cr.resolveClick({
          pickXPx: cssToTexPx(xCss),
          pickYPx: cssToTexPx(yCss),
          viewportPx: [canvas.width, canvas.height],
          visibleSources,
          uniformBuffer: r.uniformBuffer,
          // Threaded through so the pick pass can boost its floor size
          // for easier click targets — see PICK_PADDING_PX in pickRenderer.ts.
          pointSizePx: state.settings.pointSizePx,
        });
      };

      detachControls = attachOrbitControls(canvas, cam, {
        onCameraChange: () => {
          // Camera moved — wake the render loop for one frame.
          // Auto-LOD recompute, scale-bar refresh, and pick gate all
          // run inside the next frame body.
          state.subsystems.scheduler.requestRender();
        },
        onClick: (xCss, yCss) => {
          // Run a one-shot pick at the click position.  We don't use
          // the throttle guard here — clicks are infrequent and we
          // want an immediate, synchronous-feeling response.
          const pick = runPickAtCss(xCss, yCss);
          if (!pick) return;
          pick.then((result) => {
            // Click on empty space → clear; click on point → pin it.
            // The PointInfo on `result` is also cached for the
            // dblclick handler — see `lastClickedInfo` above for the
            // race-condition rationale.
            if (result.kind === 'clear') {
              setSelected(null);
              lastClickedInfo = null;
            } else {
              setSelected(result.globalIdx);
              lastClickedInfo = result.info;
            }
            // Selection changed — render so the highlight halo
            // updates on the next frame.
            state.subsystems.scheduler.requestRender();
          });
        },
        onDoubleClick: () => {
          // Native dblclick fires AFTER the two preceding click
          // events.  Both have already routed through `onClick` and
          // populated `lastClickedInfo` with the hit galaxy's
          // PointInfo.  We deliberately do NOT run a second pick
          // here: two readbacks racing on the same pickRenderer
          // resources resolved out of order in practice — the
          // dblclick read returned `clear` while the click read
          // resolved later with the real hit.  Reusing the cached
          // info is correct (same coordinates + camera state, since
          // dblclick fires before any frame can shift the scene)
          // and saves a redundant readback.
          //
          // No-op when the user double-clicked empty space —
          // `lastClickedInfo` would have been cleared by the
          // single-click handler in that case, and we don't want a
          // stale focus tween toward whatever was last clicked.
          if (!lastClickedInfo) return;
          handle.focusOn(lastClickedInfo);
        },
      });

      // ── Status: ready ────────────────────────────────────────────────────

      // `count` here is the total number of points across every loaded
      // survey at the moment we transition to "ready".  Surveys that finish
      // loading after this point are reflected via `onCloudReady`, not via
      // an additional `onStatusChange` — the status bar's job is "we're up",
      // not "live counter".
      cb.onStatusChange({
        kind: 'ready',
        count: renderer.totalCount(),
        source: cloudSourceFor(firstReadySource ?? Source.Synthetic),
      });

      // ── Seed settings callbacks ───────────────────────────────────────────
      //
      // Fire each optional settings callback once with the engine's default
      // value so React's initial state matches the engine truth (pointSizePx
      // = 2.5, brightness = 1.0, autoRotate = false, …).  Without this seed,
      // App.tsx's React state would only update on the first explicit user
      // interaction — leaving the UI showing stale values if any default
      // ever drifts between engine and component.
      //
      // The fan-out lives in `seedSettingsCallbacks.ts`; see that module for
      // the rationale on why every engine-owned setting React mirrors goes
      // through the same single audited code path.
      seedSettingsCallbacks(cb, {
        pointSize: state.settings.pointSizePx,
        brightness: state.settings.brightness,
        autoRotate: state.settings.autoRotate,
        galaxyTexturesEnabled: state.settings.galaxyTexturesEnabled,
        highlightFallback: state.settings.highlightFallback,
        realOnlyMode: state.settings.realOnlyMode,
        depthFadeEnabled: state.settings.depthFadeEnabled,
        biasMode: state.bias.mode,
        absMagLimit: state.bias.absMagLimit,
        toneMapCurve: state.settings.toneMapCurve,
        exposure: state.settings.exposure,
        lodMode: state.sources.lodMode,
        visibleSourceMask: state.sources.visibleMask,
      });

      // ── Render loop ──────────────────────────────────────────────────────

      // Assign the real frame body to the forward-declared `frame`
      // variable.  The scheduler in `state.subsystems.scheduler` was
      // wired with `onFrame: () => frame()` — that closure reads the
      // current value of `frame` lazily, so this assignment makes
      // every subsequent rAF tick run the body below.
      frame = () => {
        // ── FPS measurement ───────────────────────────────────────────────
        //
        // Sample BEFORE any frame work so the recorded timestamp is the
        // gap between successive rAF dispatches — that's what the user
        // perceives as "framerate", not the gap between when the frame
        // body finishes.  The counter handles its own < 2-samples
        // bootstrap (returns null) and rolls over a 60-frame window;
        // we just throttle the callback to integer-value changes so
        // React doesn't re-render on noise.
        const fpsNow = fpsCounter.sample(performance.now());
        if (fpsNow !== null && fpsNow !== lastReportedFps) {
          lastReportedFps = fpsNow;
          cb.onFpsChange?.(fpsNow);
        }

        // Snapshot the live state references once at the top of the
        // frame body for readability.  Each is either a live mutable
        // value (cam) or a slot that becomes null only on `destroy()`
        // (renderer, thumbnails) — so reading through the snapshots
        // for the duration of one frame is identical to reading
        // `state.*` everywhere.
        const camRef = state.cam;

        // Resize the swap-chain if the canvas element changed size.
        // `resizeCanvasToDisplay` returns `true` only when dimensions changed,
        // so we patch `cam.aspect` and `updatePosition` only in that branch.
        //
        // We also recreate the HDR target at the new viewport size in the
        // same branch.  The HDR texture is sized 1:1 with the swap chain,
        // so a stale (smaller / larger) HDR target after a resize would
        // either smear pixels or render off-canvas.  The tone-map pass
        // recreates its bind group every frame, so the new view is picked
        // up automatically on the next call.
        if (camRef && resizeCanvasToDisplay(canvas)) {
          camRef.aspect = canvas.width / canvas.height;
          updatePosition(camRef);
          state.gpu.hdrTarget?.resize({ width: canvas.width, height: canvas.height });
        }

        // Refresh the scale-bar legend. Early-returns when nothing changed,
        // so this costs ~zero on stable frames.
        updateScaleBar();

        // ── Focus / home tween ────────────────────────────────────────────
        //
        // If a tween is in flight the manager advances it.  `advance`
        // mutates the camera state and calls updatePosition internally,
        // so by the time we hit the auto-rotate block below the camera
        // is already at the eased intermediate frame.  The manager
        // auto-clears its internal reference when the tween finishes,
        // so subsequent frames skip this branch via `isActive()` returning
        // false.
        if (camRef) {
          state.subsystems.tweens.advance(camRef, performance.now());
        }

        // ── SpaceMouse per-frame application ──────────────────────────────
        //
        // The subsystem owns the whole "if puck deflected, apply axes
        // scaled by wall-clock dt, otherwise reset the dt baseline"
        // dance — including the `tweens.cancel()` precedence rule (it
        // calls back into the engine via the `cancelTween` callback we
        // wired up at construction).  Calling unconditionally is fine:
        // on a resting puck it's a single hasAnyAxis read + a null
        // assignment to the dt baseline.
        if (camRef) {
          state.subsystems.spaceMouse.applyToCamera(camRef, performance.now());
        }

        // ── Auto-rotate yaw ───────────────────────────────────────────────
        //
        // When autoRotate is on, advance yaw by a small amount every frame.
        // ~3°/sec at 60 Hz:  3° / 60 frames = 0.05° / frame
        //                    0.05° × (π/180) ≈ 0.000873 radians / frame.
        //
        // Note: this uses a fixed per-frame delta rather than tracking elapsed
        // wall-clock time.  At high refresh rates (120 Hz) the rotation is
        // smoother but twice as fast.  For a gentle ambient effect this is
        // an acceptable trade-off — no timer bookkeeping needed.
        //
        // **Why we skip auto-rotate while a tween is active:**
        //
        // The focus / focusOnHome tweens drive `cam.yaw` toward a target
        // value over ~600 ms.  The `tweens.advance()` call earlier in
        // this frame already mutated `cam.yaw` to its eased intermediate;
        // if we then add 0.000873 rad on top *every frame* the tween
        // runs, yaw lands ~36 frames × 0.000873 rad ≈ 1.8° past the
        // target by the time the tween completes — and continues
        // drifting forever after.  The user reports this as
        // "Reset Camera doesn't actually reset to the centre".  Gating
        // auto-rotate on `!tweens.isActive()` lets the home tween land
        // exactly on the target yaw; auto-rotate resumes from that
        // landing point on the next frame.
        if (state.settings.autoRotate && camRef && !state.subsystems.tweens.isActive()) {
          camRef.yaw += 0.000873;
          updatePosition(camRef);
        }

        // Snapshot the current camera state into a combined view-projection matrix.
        const vp = camRef ? computeViewProj(camRef) : null;
        const rendererRef = state.gpu.renderer;
        const thumbnailsRef = state.subsystems.thumbnails;
        const hdrTargetRef = state.gpu.hdrTarget;
        const toneMapPassRef = state.gpu.toneMapPass;
        if (!vp || !rendererRef || !camRef || !thumbnailsRef || !hdrTargetRef || !toneMapPassRef) {
          // Camera/renderer not ready yet — try again next frame.
          // (This branch only fires during the brief window between
          // engine startup and the first cloud landing; once both are
          // present it's never taken.)
          //
          // We additionally guard on `thumbnails` being non-null so the
          // renderFrame() dispatch below can take the subsystem
          // unconditionally.  The subsystem is allocated alongside the
          // GPU device in the startup IIFE, so by the time this branch
          // is reachable both are present together.  The `cam` guard
          // is redundant with the `vp` check (vp is null when cam is)
          // but kept explicit so the type narrowing flows cleanly into
          // the renderFrame call.
          state.subsystems.scheduler.requestRender();
          return;
        }

        // ── Auto-LOD mask refresh ────────────────────────────────────────
        //
        // In auto mode, recompute which surveys are visible from the
        // camera's current distance every frame.  The work is essentially
        // free — `autoLodMask` is a few branches against constants — and
        // we only fire `onSourceMaskChange` when the mask actually flips
        // bands so React's setState isn't called every frame.
        //
        // In manual mode we leave `visibleMask` alone so a user toggle
        // in the settings panel sticks until they explicitly re-enter
        // auto mode.
        if (state.sources.lodMode === 'auto') {
          const nextMask = autoLodMask(camRef.distance);
          if (nextMask !== state.sources.visibleMask) {
            state.sources.visibleMask = nextMask;
            cb.onSourceMaskChange?.(nextMask);
          }
        }

        // ── GPU dispatch ──────────────────────────────────────────────────
        //
        // The whole encoder lifecycle (createCommandEncoder, beginRenderPass
        // against the HDR target, pointRenderer.draw, thumbnails.runFrame,
        // pass.end, toneMapPass.draw, queue.submit) lives in `renderFrame.ts`.
        // Every closure variable that block read is forwarded as an explicit
        // field on `RenderFrameInput` so this site stays free of GPU
        // bookkeeping.  See that module's docstring for the in-order
        // pass description and the rationale for keeping pick + auto-LOD
        // out here in `frame()`.
        renderFrame({
          cam: camRef,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          viewProj: vp,
          device,
          context,
          hdrTargetView: hdrTargetRef.view,
          pointRenderer: rendererRef,
          milkyWayRenderer,
          filamentRenderer,
          toneMapPass: toneMapPassRef,
          thumbnails: thumbnailsRef,
          quadRenderer,
          diskRenderer,
          milkyWayITimeSec: (performance.now() - milkyWayITimeEpochMs) * 0.001 * 0.25,
          settings: {
            pointSizePx: state.settings.pointSizePx,
            brightness: state.settings.brightness,
            selectedIndex: state.picking.selectedIndex,
            visibleSourceMask: state.sources.visibleMask,
            highlightFallback: state.settings.highlightFallback,
            realOnlyMode: state.settings.realOnlyMode,
            biasMode: state.bias.mode,
            absMagLimit: state.bias.absMagLimit,
            apparentMagLimit: state.bias.apparentMagLimit,
            schechterMStar: state.bias.schechterMStar,
            schechterAlpha: state.bias.schechterAlpha,
            depthFadeEnabled: state.settings.depthFadeEnabled,
            // Task 8 of procedural-disk-impostor: feed the points-pass
            // fragment shader the same crossfade band the procedural-
            // disk pass fades IN over, so the two passes blend cleanly
            // without a double-bright donut.  Constants live in
            // `thumbnailSubsystem.ts` as a single source of truth.
            pxFadeStartPoints: PROCEDURAL_DISK_FADE_START_PX,
            pxFadeEndPoints: PROCEDURAL_DISK_FADE_END_PX,
            exposure: state.settings.exposure,
            toneMapCurve: state.settings.toneMapCurve,
            galaxyTexturesEnabled: state.settings.galaxyTexturesEnabled,
            milkyWayEnabled: state.settings.milkyWayEnabled,
            filamentsEnabled: state.settings.filamentsEnabled,
            filamentIntensity: state.settings.filamentIntensity,
          },
          famousMeta: state.sources.famousMeta,
          famousXrefs: state.sources.famousXrefs,
          clouds: state.sources.clouds,
        });

        // ── Throttled hover pick ──────────────────────────────────────────
        //
        // Strategy: pointermove updates `state.picking.latestMouseCss`; here
        // (once per frame) we check whether the mouse has moved since the
        // last pick. If it has AND no pick is already in flight, we kick
        // off a new one.
        //
        // We compare object references rather than coordinates — a new position
        // object was created by the pointermove handler, so reference inequality
        // means the mouse actually moved.
        //
        // The pick is fire-and-forget: we do NOT await it here. Awaiting inside
        // requestAnimationFrame would block the frame loop. Instead the `.then`
        // callback updates state when the GPU readback completes (typically 1-2
        // frames later).
        //
        // IMPORTANT: pick() is called *after* device.queue.submit(), so the
        // visual frame's uniform buffer has already been written with the latest
        // viewProj. The pick renderer reads the same uniform buffer.
        if (
          state.sources.clouds.size > 0 &&
          state.picking.latestMouseCss !== null &&
          state.picking.latestMouseCss !== state.picking.lastPickedMouseCss &&
          !state.picking.pickInFlight &&
          !state.picking.pointerDown // skip hover picks while a drag is in progress
        ) {
          // Snapshot the renderer's currently-visible per-source draw
          // records.  Same filter rule as the click handler — only sources
          // whose visibility bit is set are eligible to claim hover.
          const visibleSources = Array.from(rendererRef.loadedSources()).filter(
            (s) => ((state.sources.visibleMask >> s.source) & 1) !== 0,
          );
          if (visibleSources.length === 0) {
            // No surveys are visible right now (user toggled them all
            // off).  Let the loop sleep — the next setSourceVisible
            // call will wake it.
            return;
          }

          // Snapshot the position at the moment we kick off the pick.
          const pos = state.picking.latestMouseCss;
          state.picking.lastPickedMouseCss = pos;
          state.picking.pickInFlight = true;

          state.gpu
            .pickRenderer!.pick(
              [canvas.width, canvas.height],
              cssToTexPx(pos.x),
              cssToTexPx(pos.y),
              visibleSources,
              rendererRef.uniformBuffer,
              // Boost the picking floor for easier hover targets — see
              // PICK_PADDING_PX in pickRenderer.ts.
              state.settings.pointSizePx,
            )
            .then((idx) => {
              setHovered(idx === -1 ? null : idx);
              // No scheduler.requestRender() here intentionally.
              // The hover state only feeds the React InfoCard text —
              // there is no hover halo in the rendered scene today,
              // so a hover change does NOT require a re-render.
              // Skipping the wake keeps idle CPU at zero on
              // mouse-over without click.  If a future task adds a
              // hover halo, add scheduler.requestRender() here.
            })
            .finally(() => {
              state.picking.pickInFlight = false;
            });
        }

        // ── Render-on-demand: continue ticking ONLY if motion or async
        // work is in flight.  Otherwise the loop sleeps; event handlers
        // and engine handle setters call scheduler.requestRender() to
        // wake it for one frame each.
        //
        // Predicate breakdown:
        //   - autoRotate: continuous yaw advancement; render every frame.
        //   - currentTween: easeOutCubic interpolation; render until
        //     advanceCameraTween reports finished and clears the ref.
        //   - hasAnyAxis(latestSpaceMouseAxes): puck deflected; render
        //     every frame to apply the per-frame velocity.
        //   - thumbnails.hasInFlightFetches(): a thumbnail fetch is
        //     racing the network OR a recently-landed bitmap is still
        //     in its 400 ms load-fade window.  The subsystem owns both
        //     bookkeeping paths; we just OR its single boolean in.
        //     When it lands, the onResult uploads to the atlas and
        //     calls requestRender() — but we keep one frame queued
        //     anyway so the load-fade lerp ramps smoothly.
        //   - pointRenderer.isFading() / filamentRenderer.isFading():
        //     one or more clouds (point surveys or the filament skeleton)
        //     are still ramping up their per-source opacity from a recent
        //     upload (initial load or tier-swap).  The fade lasts
        //     CLOUD_FADE_DURATION_MS (~600 ms) total; we keep ticking the
        //     loop so the smoothstep advances on every frame, then go
        //     silent again.  See `cloudFade.ts` for the shared mechanism.
        const stillAnimating =
          state.settings.autoRotate ||
          state.subsystems.tweens.isActive() ||
          state.subsystems.spaceMouse.hasAxes() ||
          (state.subsystems.thumbnails !== null &&
            state.subsystems.thumbnails.hasInFlightFetches()) ||
          (state.gpu.renderer !== null && state.gpu.renderer.isFading()) ||
          (state.gpu.filamentRenderer !== null && state.gpu.filamentRenderer.isFading());
        if (stillAnimating) state.subsystems.scheduler.requestRender();
      };

      // Kick off the first render.  The scheduler was already created
      // synchronously in the state literal — this just tells it to
      // queue one rAF.  The `onFrame: () => frame()` closure picks up
      // the just-assigned real frame body.  After that single frame,
      // the loop sleeps until an event handler or a setter calls
      // scheduler.requestRender().
      state.subsystems.scheduler.requestRender();
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
      if (state.picking.selectedIndex !== null) {
        setSelected(null);
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
      detachControls?.();
      detachControls = null;

      // 5. Release GPU resources.
      state.gpu.pickRenderer?.destroy();
      state.gpu.pickRenderer = null;
      // Tone-map pass owns a 16-byte uniform buffer; HDR target owns the
      // rgba16float texture.  Both must be released so a hot-reload /
      // remount doesn't leak a per-mount texture (~16 MB at 2× DPR 1080p).
      state.gpu.hdrTarget?.destroy();
      state.gpu.hdrTarget = null;
      state.gpu.toneMapPass?.destroy();
      state.gpu.toneMapPass = null;
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

      // 6. Drop references to aid GC.
      state.gpu.renderer = null;
      state.sources.clouds.clear();
      state.cam = null;
    },

    // ── Settings panel setters ─────────────────────────────────────────────
    //
    // Each setter mutates the corresponding `state.*` field and fires the
    // optional callback so subscribed React state stays in sync.  The new
    // value takes effect on the very next rendered frame.

    setPointSize(sizePx) {
      state.settings.pointSizePx = sizePx;
      cb.onPointSizeChange?.(sizePx);
      state.subsystems.scheduler.requestRender();
    },

    setBrightness(value) {
      state.settings.brightness = value;
      cb.onBrightnessChange?.(value);
      state.subsystems.scheduler.requestRender();
    },

    setAutoRotate(enabled) {
      state.settings.autoRotate = enabled;
      cb.onAutoRotateChange?.(enabled);
      // Wake the loop — if previously idle, the new autoRotate=true
      // keeps it ticking via the still-animating predicate; if
      // toggling off, this single render lets the next frame body
      // observe `autoRotate=false` and let the loop sleep.
      state.subsystems.scheduler.requestRender();
    },

    setGalaxyTexturesEnabled(enabled) {
      // The per-frame loop reads `state.settings.galaxyTexturesEnabled`
      // directly, so the toggle takes effect on the very next rendered
      // frame — no extra signalling needed.  We still echo via the
      // optional callback so any subscribed React state mirrors the
      // engine truth (same pattern as the other settings setters above).
      state.settings.galaxyTexturesEnabled = enabled;
      cb.onGalaxyTexturesEnabledChange?.(enabled);
      state.subsystems.scheduler.requestRender();
    },

    setMilkyWayEnabled(enabled) {
      // Mirror of `setGalaxyTexturesEnabled`: mutate the per-frame
      // setting bag in place (the render-on-demand scheduler will
      // notice the next tick) and fire the echo callback so React's
      // SettingsPanel state stays in sync with the engine truth.
      state.settings.milkyWayEnabled = enabled;
      cb.onMilkyWayEnabledChange?.(enabled);
      state.subsystems.scheduler.requestRender();
    },

    setFilamentsEnabled(enabled) {
      // Toggle the cosmic-web filament-skeleton overlay.  Mirrors the
      // `setMilkyWayEnabled` setter shape (mutate the settings bag,
      // request render) but DOES NOT fire an echo callback — App.tsx
      // owns the boolean state for this toggle and updates it
      // optimistically alongside calling this setter (see App.tsx's
      // `onFilamentsChange`), so an engine echo would be redundant.
      // The asymmetry vs. galaxyTextures/milkyWay is deliberate: the
      // older toggles pre-date that pattern and would need a full
      // App.tsx rewire to switch, which isn't this task's scope.
      state.settings.filamentsEnabled = enabled;
      state.subsystems.scheduler.requestRender();
    },

    setFilamentIntensity(value) {
      // Filament overlay intensity scale, [0, 1].  Same App-owns-state
      // pattern as setFilamentsEnabled — no echo callback, optimistic
      // update on the React side, engine just mutates + requests render.
      // The shader reads the value via the per-frame uniform.
      state.settings.filamentIntensity = Math.max(0, Math.min(1, value));
      state.subsystems.scheduler.requestRender();
    },

    setHighlightFallback(enabled) {
      // Tints fallback-orientation rows magenta (see fragment shader).
      // Read by the per-frame draw call, so flipping it takes effect on
      // the very next rendered frame.
      state.settings.highlightFallback = enabled;
      cb.onHighlightFallbackChange?.(enabled);
      state.subsystems.scheduler.requestRender();
    },

    setRealOnlyMode(enabled) {
      // `discard`s fragments belonging to fallback rows so the user sees
      // only galaxies with measured (b/a, PA).  Same per-frame uniform
      // path as the highlight toggle.
      state.settings.realOnlyMode = enabled;
      cb.onRealOnlyModeChange?.(enabled);
      state.subsystems.scheduler.requestRender();
    },

    setDepthFadeEnabled(enabled) {
      // Toggles the per-galaxy camera-distance alpha fade — when on,
      // the fragment shader multiplies alpha by
      // `1 / (1 + (camDist / 1000Mpc)²)` so galaxies far behind the
      // origin contribute less, breaking up the depth-column saturation
      // at the centre of the catalog.  Same per-frame uniform path as
      // the other UI booleans.
      state.settings.depthFadeEnabled = enabled;
      cb.onDepthFadeEnabledChange?.(enabled);
      state.subsystems.scheduler.requestRender();
    },

    setBiasMode(mode) {
      // Forwarded into the per-frame uniform on the next draw.  The shader
      // branches on the integer value (0 = none, 1 = volume-limited, …)
      // so flipping this from devtools or the future SettingsPanel takes
      // effect on the next rendered frame without any pipeline rebuild.
      //
      // We always fire the echo callback — even when `mode === state.bias.mode`
      // — so the UI seeds correctly on first call.  The plan calls this
      // out explicitly because `setBiasMode(BiasMode.None)` is a legitimate
      // first-frame state that must reach the SettingsPanel.
      const wasSchechter = state.bias.mode === BiasMode.Schechter;
      const isSchechter = mode === BiasMode.Schechter;
      const wasAngular = state.bias.mode === BiasMode.AngularReweight;
      const isAngular = mode === BiasMode.AngularReweight;
      state.bias.mode = mode;
      cb.onBiasModeChange?.(mode);

      // ── Lazy Schechter-ratio bake (perf) ──────────────────────────────
      //
      // The per-galaxy Schechter integral is ~700 M math ops at full deck
      // (3.5 M galaxies × 200-step trapezoidal integral) — wasted work if
      // the user never picks mode 3.  We defer it until the first transition
      // TO Schechter mode, then cache the result on the renderer for instant
      // re-toggle.  See `pointRenderer.applySchechterMode()` for the full
      // mirror-array re-upload trick that keeps this fire-and-forget.
      //
      // Going AWAY from Schechter is intentionally a no-op: the shader's
      // `select(1.0, schechterRatio, biasMode == 3u)` gate already ignores
      // slot 11 in modes 0/1/2, so leaving the values in the GPU buffer is
      // both correct and cheaper than re-uploading 1.0s.
      if (!wasSchechter && isSchechter && state.gpu.renderer) {
        state.gpu.renderer
          .applySchechterMode()
          .then(() => {
            // Weights are now in the GPU buffer; the next frame will
            // pick them up.
            state.subsystems.scheduler.requestRender();
          })
          .catch((err) => {
            console.error('[engine] Schechter ratio bake failed:', err);
          });
      }

      // ── Lazy HEALPix angular re-weight bake ────────────────────────────
      //
      // Mirror of the Schechter transition above.  The HEALPix bake is
      // cheaper (~100-300 ms at full deck — three linear passes plus a
      // per-shell median sort) but still long enough to drop a frame, so
      // we ship it to a worker via `applyAngularReweightMode()`.  Per-
      // survey, never global: each cloud bins itself, so SDSS's footprint
      // can't contaminate GLADE's correction.
      //
      // Going AWAY from mode 4 is a no-op for the same reason as Schechter:
      // the shader's `select(1.0, angularDensityWeight, biasMode == 4u)`
      // gate already ignores slot 12 in the other four modes, so leaving
      // the baked weights in the GPU buffer is correct AND keeps the
      // next mode-4 toggle instant (the cache hit fires off a single
      // re-upload, no worker spawn).
      if (!wasAngular && isAngular && state.gpu.renderer) {
        state.gpu.renderer
          .applyAngularReweightMode()
          .then(() => {
            state.subsystems.scheduler.requestRender();
          })
          .catch((err) => {
            console.error('[engine] Angular re-weight bake failed:', err);
          });
      }

      // Wake the loop so the new biasMode uniform takes effect on the
      // next rendered frame.  Schechter / angular bakes (above) also
      // call requestRender from their resolve handlers in Task 5 to
      // trigger a second render once the GPU buffers are ready.
      state.subsystems.scheduler.requestRender();
    },

    setAbsMagLimit(absMag) {
      // Threshold used by `BiasMode.VolumeLimited`.  Galaxies with absolute
      // magnitude *fainter* than this (M > absMag, since fainter = larger
      // M) are discarded in the vertex stage.  Seeded at engine init from
      // the closure default (-19, the SDSS spec sample limit); subsequent
      // calls overwrite that.
      state.bias.absMagLimit = absMag;
      cb.onAbsMagLimitChange?.(absMag);
      state.subsystems.scheduler.requestRender();
    },

    setExposure(value) {
      // Clamp into a sane range so a runaway slider or a debug
      // console call (e.g. `setExposure(1e9)`) can't blow out the
      // float buffer or, on the lower end, multiply the HDR signal
      // by zero and produce a black frame the user can't recover
      // from.  0.05 keeps a faint signal visible; 16 is well past
      // any realistic peak (~5-10 in the densest cluster cores).
      state.settings.exposure = Math.max(0.05, Math.min(16, value));
      // Echo the *clamped* value back to the UI so the slider's
      // displayed number agrees with what the shader actually uses.
      // Mirrors the setToneMapCurve / setBiasMode pattern: always
      // fire (even on no-op identical values) so the first call
      // seeds React state correctly without a separate code path.
      cb.onExposureChange?.(state.settings.exposure);
      state.subsystems.scheduler.requestRender();
    },

    setToneMapCurve(curve) {
      // Forwarded into the per-frame uniform on the next draw.  The
      // shader branches on the integer value (0=Linear, 1=Reinhard,
      // 2=Asinh, 3=Gamma2, 4=Aces) so flipping this from devtools or
      // the SettingsPanel takes effect on the next rendered frame
      // without any pipeline rebuild.
      //
      // Always fire the echo callback — even when `curve === state.settings.toneMapCurve`
      // — so the UI seeds correctly on first call (mirrors the
      // setBiasMode pattern).
      state.settings.toneMapCurve = curve;
      cb.onToneMapCurveChange?.(curve);
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
      // Debug aid for tuning the initial camera framing + reset target.
      // Prints the live camera state in copy-paste-friendly form so the
      // values can be pasted into `cameraFraming.ts` (initial camera) or
      // wherever the reset target is hard-coded.  No-op when the camera
      // hasn't been constructed yet (early invocation during engine boot).
      const cam = state.cam;
      if (!cam) {
        console.log('[engine] logCameraState: camera not ready yet');
        return;
      }
      const out = {
        target: [
          Number(cam.target[0].toFixed(2)),
          Number(cam.target[1].toFixed(2)),
          Number(cam.target[2].toFixed(2)),
        ],
        distance: Number(cam.distance.toFixed(2)),
        yaw: Number(cam.yaw.toFixed(4)),
        pitch: Number(cam.pitch.toFixed(4)),
        fovYRad: Number(cam.fovYRad.toFixed(4)),
      };
      // Two prints — the structured form for human reading, the raw
      // single-line for fast copy-paste into source.
      console.log('[engine] camera state:', out);
      console.log(
        `[engine] one-liner: target: [${out.target.join(', ')}], distance: ${out.distance}, yaw: ${out.yaw}, pitch: ${out.pitch}, fovYRad: ${out.fovYRad}`,
      );
    },

    focusOn(info) {
      // Camera may not be ready yet (cloud still loading); drop the call.
      // Same defensive pattern as resetCamera() above.
      const cam = state.cam;
      if (!cam) return;

      // Notify before the tween starts so the URL-sync hook can update
      // `#focus=…` in lock-step with the user's commitment.  Callers
      // (Focus button, `f` shortcut, double-click) no longer have to
      // setFocused manually — the engine is the single source of truth
      // for "we just decided to focus on this galaxy."
      cb.onFocusChange?.(info);

      // Snapshot the CURRENT camera state — not the original startup state —
      // so an in-progress tween hands off smoothly to the new one.  vec3.clone
      // copies the target tuple so future mutation of cam.target doesn't
      // corrupt the from-snapshot.
      //
      // The framing distance is 4× the galaxy's diameter (close-but-not-
      // inside framing that scales naturally with size); when the
      // PointInfo's diameter is the fallback 30 kpc, this lands on the
      // pre-v4 placeholder framing exactly.
      state.subsystems.tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(info.x, info.y, info.z),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(info.diameterKpc),
        fromYaw: cam.yaw,
        toYaw: cam.yaw, // preserve yaw — user keeps their orientation
        fromPitch: cam.pitch,
        toPitch: cam.pitch, // preserve pitch
      });
      // Kick the loop into motion — the tween's per-frame advance will
      // keep it ticking via the still-animating predicate until the
      // tween completes.
      state.subsystems.scheduler.requestRender();
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

      // The engine's selectedIndex is GLOBAL — not per-source local — so
      // we have to compute the global index.  The renderer keeps each
      // source's instanceIdOffset; sum the famous source's offset with
      // the local idx to reconstruct the same value the picker would write.
      const offset = state.gpu.renderer?.instanceIdOffset(Source.Famous) ?? 0;
      const globalIdx = offset + localIdx;
      setSelected(globalIdx);
      // selectFamous is a deliberate user focus action (palette pick),
      // so the camera-focus target moves to this galaxy too.
      cb.onFocusChange?.(info);

      // Tween the camera onto the galaxy — same tween as `focusOn`.
      // We inline the tween-creation here rather than calling `handle.focusOn`
      // because we're inside the object literal and `this` would be unreliable
      // at call time (depending on how App.tsx invokes the handle method).
      // Copying the tween-setup block keeps the behaviour identical.
      const cam = state.cam;
      if (!cam) return;
      state.subsystems.tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(info.x, info.y, info.z),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(info.diameterKpc),
        fromYaw: cam.yaw,
        toYaw: cam.yaw,
        fromPitch: cam.pitch,
        toPitch: cam.pitch,
      });
      state.subsystems.scheduler.requestRender();
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

      // Compute the GLOBAL instance index (selection state is keyed
      // globally because the picker writes a per-vertex globalIdx;
      // see `instanceIdOffset` for the running-sum convention).
      //
      // Caveat: `instanceIdOffset` reads from the renderer's per-source
      // bookkeeping, which lags `state.sources.clouds` by an upload
      // chain tick (see the cloud-load wiring around line 803).  When
      // selectByAlias is called from a deep-link drain that fires the
      // moment a cloud lands data-side, the renderer hasn't uploaded
      // yet and the offset is 0 — meaning `globalIdx` would round-trip
      // through `pointInfoFromGlobal` to a wrong source.  We pass the
      // already-built `info` to `setSelected` so the React side gets
      // the correct PointInfo regardless; the halo's globalIdx will
      // correct itself once the picker draws against the freshly-
      // uploaded source.
      const offset = state.gpu.renderer?.instanceIdOffset(source) ?? 0;
      const globalIdx = offset + localIdx;
      setSelected(globalIdx, info);
      // selectByAlias is a deliberate user focus action (palette pick
      // OR deep-link resolve), so the camera-focus target moves with
      // the selection.
      cb.onFocusChange?.(info);

      // Camera focus tween — same setup as selectFamous / focusOn.
      const cam = state.cam;
      if (!cam) return;
      state.subsystems.tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(info.x, info.y, info.z),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(info.diameterKpc),
        fromYaw: cam.yaw,
        toYaw: cam.yaw,
        fromPitch: cam.pitch,
        toPitch: cam.pitch,
      });
      state.subsystems.scheduler.requestRender();
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
    // Promise-returning shim over the PGC-alias slot.  Matches the public
    // signature of the legacy standalone `loadPgcAliases()` so existing
    // palette callers (the `useAliasIndex` hook) can be migrated to call
    // `handle.loadPgcAliases()` without changing their await/result
    // shape — a Map<bigint, readonly string[]> on success, an empty Map
    // on graceful failure (matching the old "feature off" behaviour the
    // hook already tolerates).
    //
    // **Idempotence.**  The slot's `load()` is itself idempotent — calling
    // it twice in flight just bumps the generation; the first fetch's
    // race-check drops its commit if a second `load()` arrived.  After
    // the first success, `slot.state().kind === 'ready'` so the
    // subscriber here sees the cached value instantly and resolves
    // synchronously-ish (one microtask).  The "subscribe-once-per-call"
    // shape mirrors the per-slot first-arrival capture in the boot path
    // and keeps the resolve path identical for fresh and cached cases.
    loadPgcAliases() {
      const slot = state.assetSlots.pgcAlias;
      if (!slot) {
        // Slot not minted yet (engine still in pre-IIFE init).  An empty
        // Map is the same graceful-degradation result we'd return on
        // 404 — palette code already tolerates an empty alias index.
        return Promise.resolve(new Map() as PgcAliasMap);
      }
      slot.load();
      // If the slot is already settled (cached from a prior call), the
      // subscriber won't fire again — fast-path through `state()` so we
      // resolve synchronously on the next microtask rather than waiting
      // for a state transition that will never arrive.
      const current = slot.state();
      if (current.kind === 'ready') return Promise.resolve(current.value);
      return new Promise<PgcAliasMap>((resolve) => {
        const unsub = slot.subscribe((s) => {
          if (s.kind === 'ready') {
            unsub();
            resolve(s.value);
          } else if (s.kind === 'error') {
            unsub();
            // Empty Map matches the legacy `loadPgcAliases` behaviour:
            // the palette's famous-only search still works, just without
            // the GLADE/2MRS PGC join.
            resolve(new Map());
          }
        });
      });
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

  return handle;
}
