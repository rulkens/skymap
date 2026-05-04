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
 * The pure / leaf concerns live in sibling modules so this file can stay
 * focused on the imperative orchestration:
 *
 *   - `autoLod.ts`           — LOD heuristic (also re-exported as public API)
 *   - `focusTween.ts`        — focus camera tween constants + distance helper
 *   - `pointInfoBuilder.ts`  — buildPointInfo / maxAbsCoord / niceRound
 *   - `cloudLoader.ts`       — parallel /data/{sdss,2mrs,glade}.bin fetch + synthetic fallback
 *
 * The pointer / wheel / pick / hover-select handling stays inline below
 * because all of it shares closure state (renderer, cloud, cam, indices,
 * masks) — extracting it would force every helper to take ~10 parameters.
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
import { ToneMapCurve } from '../../data/toneMapCurve';
import { createOrbitCamera, computeViewProj, updatePosition } from '../camera/orbitCamera';
import { attachOrbitControls } from '../camera/orbitControls';
import { ALL_VISIBLE_MASK, Source, maskWith, maskWithout } from '../../data/sources';
import { BiasMode } from '../../data/biasMode';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
} from '../../data/defaults';
import type { LodMode, PointCloud } from '../../@types';
import type { EngineCallbacks, EngineHandle } from '../../@types';
import { vec3 } from 'gl-matrix';

import { autoLodMask } from './autoLod';
import { createTweenManager } from './tweenManager';
import { createRenderScheduler, type RenderScheduler } from './renderScheduler';
import { buildPointInfo, maxAbsCoord } from './pointInfoBuilder';
import { computeInitialCamera, type InitialCam } from './cameraFraming';
import { seedSettingsCallbacks } from './seedSettingsCallbacks';
import { computeScaleInfo } from './scaleBar';
import { loadAllClouds, buildSyntheticFallback, type CloudSource } from './cloudLoader';
import { FOCUS_TWEEN_MS, focusDistanceMpc } from './focusTween';
import { loadFamousSidecars, type FamousMetaEntry, type FamousXrefMap } from './famousMetaLoader';

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
import {
  createThumbnailSubsystem,
  type ThumbnailSubsystem,
} from './thumbnailSubsystem';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// The whole subsystem (WebHID device handle, axes-cache, dt-baseline,
// sensitivity scalar, per-frame camera mutation) lives in
// `spaceMouseSubsystem.ts`.  Engine-side we just instantiate it once,
// pass it `cancelTween` / `onAxes` / `onConnectionChange` callbacks,
// and call `applyToCamera()` from `frame()`.  The handle's
// connect/disconnect/sensitivity setters forward straight through.
import {
  createSpaceMouseSubsystem,
  type SpaceMouseSubsystem,
} from './spaceMouseSubsystem';
import { createClickResolver, type ClickResolver } from './clickHandler';
import { attachEngineInputs, type InputBindings } from './inputBindings';

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

  type MousePos = { x: number; y: number };

  let latestMouseCss: MousePos | null = null;
  let lastPickedMouseCss: MousePos | null = null;
  let pickInFlight = false;
  let hoveredIndex: number | null = null;
  let selectedIndex: number | null = null;
  let pointerDown = false;

  // ── Settings panel state ─────────────────────────────────────────────────
  //
  // These are the source of truth for the visual settings exposed by the
  // Settings Panel. They are mutated by the public handle setters below and
  // consumed in the render loop (renderer.draw) and frame tick (autoRotate).
  // Initial values seeded from `data/defaults.ts` — single source of
  // truth shared with App.tsx so the SettingsPanel doesn't briefly flash
  // a stale value before the engine's first echo callback fires.  See
  // that module's docstring for the full rationale + per-default
  // commentary.
  let pointSizePx = DEFAULT_POINT_SIZE_PX;
  let brightness = DEFAULT_BRIGHTNESS;
  let autoRotate = DEFAULT_AUTO_ROTATE;
  let galaxyTexturesEnabled = DEFAULT_GALAXY_TEXTURES_ENABLED;
  let highlightFallback = DEFAULT_HIGHLIGHT_FALLBACK;
  let realOnlyMode = DEFAULT_REAL_ONLY_MODE;
  let depthFadeEnabled = DEFAULT_DEPTH_FADE_ENABLED;

  // ── Malmquist-bias correction state (Task 2 of malmquist-bias plan) ─────
  //
  // `biasMode` chooses which correction the renderer applies in its vertex
  // stage; `absMagLimit` is the threshold for `BiasMode.VolumeLimited`.
  // Both default off / sensible-SDSS so the UI seeded by the echo callback
  // at init looks correct even before the user opens the settings panel.
  // The other Task-3/4 thresholds also live as closure state here so a
  // single uniform update path stays at the bottom of the frame loop.
  //
  // Why -19 as the volume-limited default?  It's roughly the absolute
  // magnitude where the SDSS spectroscopic main sample is volume-complete
  // out to the survey's flux limit — bright enough that almost every
  // catalog galaxy meeting it has a measured spectrum, dim enough that
  // we still see plenty of structure.
  let biasMode: BiasMode = DEFAULT_BIAS_MODE;
  let absMagLimit = DEFAULT_ABS_MAG_LIMIT;

  // ── HDR + tone-map state ─────────────────────────────────────────────────
  //
  // `exposure` multiplies the HDR signal *before* the tone-map curve
  // compresses it.  `toneMapCurve` selects which curve runs — see
  // `data/toneMapCurve.ts` for the five options.  Both are forwarded into
  // the tone-map pass uniform once per frame; switching at runtime is a
  // single 4-byte uniform write — no pipeline rebuild.
  //
  let exposure = DEFAULT_EXPOSURE;
  let toneMapCurve: ToneMapCurve = DEFAULT_TONE_MAP_CURVE;
  // Reserved-for-future fields; Tasks 3 + 4 will populate them.  Until then
  // the renderer reads them but the shader's mode-2/3 branches stay inert.
  let apparentMagLimit = 0;
  let schechterMStar = 0;
  let schechterAlpha = 0;

  // ── Source visibility bitmask + LOD mode ────────────────────────────────
  //
  // 32-bit bitmask gating which surveys are drawn each frame; one bit per
  // `Source` enum value. The renderer iterates its `loadedSources()` and
  // skips any whose bit is clear. Default = `ALL_VISIBLE_MASK` so we
  // preserve "draw everything that is loaded" behaviour until either the
  // auto-LOD heuristic recomputes it from the camera distance, or a user
  // toggle in the settings panel forces a manual choice.
  //
  // `lodMode` decides which path "owns" the mask:
  //   - 'auto'   → the render-loop tick recomputes the mask each frame from
  //                `autoLodMask(cam.distance)`.  Manual overrides do not
  //                stick — they get clobbered on the next frame.
  //   - 'manual' → the user (or a programmatic call to `setSourceVisible`)
  //                owns the mask; auto-LOD is paused.
  let visibleSourceMask = DEFAULT_VISIBLE_SOURCE_MASK;
  let lodMode: LodMode = DEFAULT_LOD_MODE;

  // ── Initial camera snapshot ───────────────────────────────────────────────
  //
  // Written once by the async IIFE after the cloud loads and bbox is known.
  // Read by `resetCamera()` in the public handle. Declared here (outside the
  // IIFE) so the public handle's closure can reach it without hoisting the
  // entire async block.  The `InitialCam` shape itself lives in
  // `cameraFraming.ts` alongside the pure helper that produces it.
  let initialCamRef: InitialCam | null = null;

  // ── In-flight focus / home tween ────────────────────────────────────────
  //
  // At most one tween at a time.  The manager owns the single mutable
  // `currentTween` reference internally; the engine just calls `start`,
  // `cancel`, `isActive`, and `advance`.  See `tweenManager.ts` for the
  // rationale on why the lone closure variable became a tiny facade.
  //
  // Sites that mutate the manager:
  //   - the public handle's `focusOn` / `focusOnHome` / `selectFamous`
  //     (start a tween — auto-replaces any running one),
  //   - the `pointerdown` handler                  (cancel on user grab),
  //   - the SpaceMouse per-frame block             (cancel on puck deflect),
  //   - the per-frame `frame()` loop               (advance + auto-clear).
  const tweens = createTweenManager();

  // ── SpaceMouse subsystem ───────────────────────────────────────────────
  //
  // All puck state — latest axes, dt baseline, sensitivity scalar, the
  // lazily-allocated WebHID device handle — is owned internally by the
  // subsystem.  We hand it three callbacks at construction:
  //
  //   - `cancelTween`     : called from `applyToCamera()` whenever an
  //                          axis is non-zero, so the focus tween yields
  //                          to user input (same precedence as mouse drag).
  //   - `onConnectionChange` : forwarded to the engine's UI callback so
  //                            React's "Connected" indicator drops back to
  //                            false when the puck is unplugged.
  //   - `onAxes`          : called from the WebHID inputreport listener
  //                          (outside the rAF loop) so the next frame
  //                          sees the new axes.
  //
  // The `applyToCamera()` method does NOT need to wake the scheduler —
  // it runs inside `frame()` and the still-animating predicate at the
  // bottom of the frame body keeps the loop ticking via `hasAxes()`.
  const spaceMouse: SpaceMouseSubsystem = createSpaceMouseSubsystem({
    cancelTween: () => tweens.cancel(),
    onConnectionChange: (connected) => {
      cb.onSpaceMouseConnectedChange?.(connected);
      // Wake one frame so the still-animating predicate sees the
      // freshly-zeroed axes (the subsystem clears them on disconnect)
      // and lets the loop sleep cleanly.
      scheduler.requestRender();
    },
    onAxes: () => scheduler.requestRender(),
  });

  // Render scheduler — owns the single rAF token and the dirty flag.
  // Built inside the async IIFE because `frame` is defined there; the
  // scheduler instance is hoisted into the outer closure so `destroy()`
  // can call its `cancelRender()` from the public handle below.
  //
  // Initialised to a no-op shim so the type stays non-nullable; the
  // real scheduler replaces this once the IIFE finishes setup.
  let scheduler: RenderScheduler = {
    requestRender(): void {
      /* not yet wired */
    },
    cancelRender(): void {
      /* not yet wired */
    },
    isScheduled(): boolean {
      return false;
    },
  };

  // ── Loaded clouds (one per uploaded survey) ─────────────────────────────
  //
  // Multi-survey picking needs the original `PointCloud` for whichever
  // source the picker hits, so `buildPointInfo` can pull positions and
  // photometry by *local* index.  We mirror the renderer's per-source
  // bookkeeping in JS land here: the renderer owns the GPU buffers, this
  // map owns the CPU-side struct-of-arrays.
  //
  // Empty until the first parallel fetch resolves; pick/hover paths guard
  // against that empty state.
  const clouds = new Map<Source, PointCloud>();

  // ── Famous-galaxy sidecars ───────────────────────────────────────────────
  //
  // Loaded asynchronously after the cloud fetch kicks off.  Both arrays
  // start empty; `pointInfoBuilder` checks for `famousMeta[idx]` being
  // defined before using them, so a hover that fires before the sidecars
  // land just renders the generic InfoCard layout — graceful degradation.
  let famousMeta: FamousMetaEntry[] = [];
  let famousXrefs: FamousXrefMap = {};

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
  function resolveGlobalIdx(
    globalIdx: number,
  ): { source: Source; localIdx: number } | null {
    if (!renderer) return null;
    let remaining = globalIdx;
    for (const entry of renderer.loadedSources()) {
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
    const c = clouds.get(resolved.source);
    if (!c) return null;
    return buildPointInfo(c, resolved.localIdx, resolved.source, famousMeta, famousXrefs);
  }

  // Renderer and pickRenderer are null until GPU init completes.
  let renderer: PointRenderer | null = null;
  let pickRendererHandle: ReturnType<typeof createPickRenderer> | null = null;
  // ClickResolver wraps the picker + the (globalIdx → PointInfo) walk.
  // Built inside the IIFE once `pickRendererHandle` exists; null until
  // then.  See `clickHandler.ts` for the full state-machine commentary.
  let clickResolver: ClickResolver | null = null;
  // HDR + tone-map handles share the same null-until-init lifecycle as the
  // pick renderer above — the IIFE writes into these once the GPU device is
  // available, and `destroy()` reads them to release the texture and the
  // tone-map uniform buffer.
  let hdrTargetHandle: ReturnType<typeof createHdrTarget> | null = null;
  let toneMapPassHandle: ReturnType<typeof createToneMapPass> | null = null;

  // Galaxy-thumbnail subsystem — built inside the IIFE once the GPU device
  // exists.  The render-on-demand predicate at the bottom of `frame()`
  // calls `thumbnails.hasInFlightFetches()` so the loop keeps ticking
  // while bitmaps are still landing.  `destroy()` calls `.destroy()` to
  // tear down the eviction handler and clear bookkeeping sets.
  let thumbnails: ThumbnailSubsystem | null = null;

  // Cleanup function returned by `attachOrbitControls`.  Orbit-controls
  // attachment lives outside the inputBindings module because it needs
  // a fully-constructed `OrbitCamera`, which doesn't exist at engine()
  // time — see `inputBindings.ts`'s docstring for the rationale.
  let detachControls: (() => void) | null = null;

  // Bag of pointer/keyboard/resize listeners.  See `inputBindings.ts`
  // for the full list of events and the listener-bookkeeping pattern
  // it owns.  `destroy()` calls `inputBindings.detach()` to remove
  // every listener in one shot.
  let inputBindings: InputBindings | null = null;

  // ── Scale-bar deduplication ──────────────────────────────────────────────
  //
  // We only fire `onScaleChange` when the formatted label or rounded pixel
  // width actually changes. A string signature (`"${niceMpc}:${widthPx}"`)
  // is the cheapest dedup — one string comparison per frame.
  const SCALE_TARGET_PX = 150;
  let lastScaleSig = '';
  let cam: ReturnType<typeof createOrbitCamera> | null = null;

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
    if (idx === hoveredIndex) return;
    hoveredIndex = idx;
    cb.onHoverChange(idx !== null ? pointInfoFromGlobal(idx) : null);
  }

  /**
   * Notify the UI if the selected point changed.
   */
  function setSelected(idx: number | null): void {
    if (idx === selectedIndex) return;
    selectedIndex = idx;
    cb.onSelectChange(idx !== null ? pointInfoFromGlobal(idx) : null);
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
    if (!cam) return;

    const info = computeScaleInfo({
      cam,
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
      // Mirror into the outer-scoped refs so `destroy()` (defined on the
      // public handle, outside this IIFE) can release the GPU resources.
      hdrTargetHandle = hdrTarget;
      toneMapPassHandle = toneMapPass;

      // Build the GPU pipeline; cloud data is loaded below.
      // PointRenderer (and QuadRenderer/DiskRenderer further down) target
      // the HDR rgba16float texture instead of the swap-chain `format`.
      // Their pipelines bake this into a fixed colour-target descriptor at
      // construction time, so the format choice has to land here.
      renderer = new PointRenderer(device, 'rgba16float');

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
      // Build the subsystem and hand it the renderer references for
      // atlas-view binding.  The subsystem's `bindToRenderers` is split
      // out from its constructor because the renderers need to exist
      // first; building them here keeps the construction order linear.
      thumbnails = createThumbnailSubsystem({
        device,
        requestRender: () => scheduler.requestRender(),
      });
      thumbnails.bindToRenderers(quadRenderer, diskRenderer);

      // Signal loading state immediately so the user knows something is
      // happening before the (potentially multi-second) fetch completes.
      cb.onStatusChange({ kind: 'loading' });

      // ── Parallel multi-survey load ───────────────────────────────────────
      //
      // Kick all three real-survey fetches off at once.  Each one streams
      // its decoded cloud back through the `onResult` callback the moment
      // it lands, so we can:
      //   - upload it to the renderer (the user sees points appear)
      //   - record it in the local `clouds` map (so picking can resolve it)
      //   - fire the optional `onCloudReady` so the UI can show progress
      //
      // The first cloud to arrive *also* owns the camera auto-framing.  We
      // do this on first arrival rather than waiting for everything to
      // settle: 2MRS at 2 MB lands far sooner than GLADE at ~96 MB on a
      // typical connection, and we want the camera to snap to a sensible
      // framing immediately rather than staring at default-zoom blackness.
      // Subsequent clouds inherit the framing — they all share the same
      // origin coordinate system, so re-framing on every arrival would
      // just yank the camera around without benefit.
      let firstResult: { source: Source; cloud: PointCloud; cloudSource: CloudSource } | null =
        null;

      const { loadedCount } = await loadAllClouds((result) => {
        // Renderer might have been destroyed mid-load (StrictMode unmount,
        // hot-reload).  Drop the result silently in that case.
        if (!renderer) return;

        // `renderer.upload()` is now async — the per-galaxy bake runs in a
        // Web Worker so the main thread stays responsive while ~3.5 M
        // galaxies are processed.  We deliberately DON'T await here:
        // firing `onCloudReady` immediately lets the UI show "SDSS loaded"
        // the moment the .bin decode finishes, even though the GPU buffer
        // takes another second or two to bake.  The renderer's per-frame
        // `draw()` simply skips any source whose buffer isn't ready yet —
        // it pops in on the first frame after the worker resolves.
        //
        // Errors from the worker are caught + logged; an upload failure
        // shouldn't crash the entire engine since other surveys may still
        // be loading.
        renderer
          .upload(result.source, result.cloud)
          .then(() => {
            // GPU buffer is now ready — render so the new points appear
            // (the per-frame draw skips sources whose buffer isn't ready
            // yet, so without this call the cloud would stay invisible
            // until some other event woke the loop).
            scheduler.requestRender();
          })
          .catch((err) => {
            console.error(`[engine] point bake failed for source ${result.source}:`, err);
          });
        clouds.set(result.source, result.cloud);
        cb.onCloudReady?.(result.source, result.cloud.count);
        // Wake immediately too — `clouds.set` enables hover/pick on the
        // (still-baking) cloud's CPU-side metadata.  Harmless even if
        // the GPU buffer isn't quite ready: the per-frame draw skips
        // not-yet-uploaded sources by design.
        scheduler.requestRender();

        if (firstResult === null) {
          firstResult = result;
        }
      });

      // ── Famous sidecars — fire-and-forget ─────────────────────────────────
      //
      // Kicked off after `loadAllClouds` resolves so we don't compete with
      // the much-larger survey fetches for bandwidth.  The sidecars are tiny
      // (well under 100 KB combined) so they land almost instantly on any
      // connection.  Failures are swallowed: absent sidecars don't break the
      // engine — famous galaxies just render without the enriched InfoCard
      // block until the user reloads.
      loadFamousSidecars()
        .then((sc) => {
          famousMeta = sc.meta;
          famousXrefs = sc.xrefs;
          // No direct render-state change — the sidecars only feed
          // hover-card text — but the famous-galaxy thumbnails
          // referenced by these entries will now be enqueueable from
          // the per-frame loop.  Wake one frame so the user sees the
          // famous overlays without having to nudge the camera.
          scheduler.requestRender();
        })
        .catch((err) => {
          console.warn('[engine] famous sidecars failed to load:', err);
        });

      // ── Synthetic fallback ──────────────────────────────────────────────
      //
      // If every real fetch failed (offline, no .bin files built, decode
      // error), the user still deserves *something* on screen.  Generate
      // the procedural cloud and route it through the same path so the
      // renderer, the clouds map, and the React status all line up with
      // the real-data case.
      if (loadedCount === 0) {
        const fallback = buildSyntheticFallback();
        if (renderer) {
          // Same fire-and-forget pattern as the real-data path above —
          // the synthetic cloud is small (<10k points) so the worker
          // finishes nearly instantly, but we keep the error path
          // explicit so a future regression doesn't silently swallow it.
          renderer
            .upload(fallback.source, fallback.cloud)
            .then(() => {
              scheduler.requestRender();
            })
            .catch((err) => {
              console.error('[engine] synthetic-fallback bake failed:', err);
            });
          clouds.set(fallback.source, fallback.cloud);
          cb.onCloudReady?.(fallback.source, fallback.cloud.count);
        }
        firstResult = fallback;
      }

      // If we somehow have no first result *and* no fallback (e.g. the
      // engine was destroyed mid-load), bail before touching the camera.
      if (firstResult === null) return;

      // Build the pick renderer. It shares the same vertex/uniform buffers as
      // the visual renderer — no extra GPU memory for point data.
      pickRendererHandle = createPickRenderer(device);
      // The resolver adapts the engine's existing per-global-idx
      // helpers (see `resolveGlobalIdx` and `pointInfoFromGlobal`
      // higher up) into the (cloud, localIdx, source) shape the
      // resolver wants.  The `cloud` lookup goes through the live
      // `clouds` map so a cloud loaded after engine init still picks
      // up correctly.
      clickResolver = createClickResolver({
        pickRenderer: pickRendererHandle,
        resolveGlobalIdx: (globalIdx) => {
          const r = resolveGlobalIdx(globalIdx);
          if (!r) return null;
          const cloud = clouds.get(r.source);
          if (!cloud) return null;
          return { source: r.source, localIdx: r.localIdx, cloud };
        },
        buildPointInfo: (cloud, localIdx, src) =>
          buildPointInfo(cloud, localIdx, src, famousMeta, famousXrefs),
      });

      // ── Camera auto-framing ──────────────────────────────────────────────
      //
      // Frame to whichever cloud arrived first (see comment above).  Each
      // survey has a very different effective depth — 2MRS ~250 Mpc, GLADE
      // ~1.5 Gpc, SDSS ~3 Gpc — and using the first arrival's bbox tends
      // to give the closest "natural" view to start exploring from, with
      // the auto-LOD kicking surveys in/out as the user zooms.
      //
      // `bbox` = max abs of any coordinate component across every cloud
      // loaded so far (cheap; no sqrt).  We deliberately use the LARGEST
      // bbox seen so the far plane covers every survey's outermost galaxy
      // — otherwise SDSS's deep galaxies would clip when 2MRS framed first.
      //
      // `computeInitialCamera` (cameraFraming.ts) turns the bbox + FOV
      // into a target/distance/yaw/pitch/near/far snapshot, including the
      // global zoom-envelope clamp and the empirical INITIAL_FRAME_FACTOR.
      let bbox = maxAbsCoord(firstResult.cloud);
      for (const c of clouds.values()) {
        const cb2 = maxAbsCoord(c);
        if (cb2 > bbox) bbox = cb2;
      }
      const fovYRad = (Math.PI / 180) * 60;
      const initialCam = computeInitialCamera({ bbox, fovYRad });
      const source: CloudSource = firstResult.cloudSource;

      cam = createOrbitCamera({
        target: initialCam.target,
        distance: initialCam.distance,
        yaw: initialCam.yaw,
        pitch: initialCam.pitch,
        fovYRad: initialCam.fovYRad,
        aspect: canvas.width / canvas.height,
        near: initialCam.near,
        far: initialCam.far,
      });

      // ── Initial camera snapshot for resetCamera() ────────────────────────
      //
      // Capture the framing values now, after the cloud bbox is known, so
      // `resetCamera()` can restore them at any later time.  We mirror the
      // helper's output rather than re-reading from `cam` so future
      // reconfigures of the camera (e.g. user-driven FOV changes) don't
      // accidentally drift the reset target.  `aspect` is intentionally not
      // captured — reset uses the *current* canvas aspect so the projection
      // stays correct after a window resize.
      initialCamRef = initialCam;

      // ── Pointer / keyboard / resize listeners ────────────────────────────
      //
      // Centralised in `inputBindings.ts` so every DOM listener the
      // engine cares about lives in one module.  Each callback below
      // is the *semantic* engine action — the inputBindings module
      // already converts `e.clientX/Y` to a CSS-pixel record and
      // calls `scheduler.requestRender()` after every event so we
      // don't repeat that wake-up at every site.
      inputBindings = attachEngineInputs({
        canvas,
        scheduler,
        // Track latest mouse position for the per-frame throttled
        // hover pick.  The pick itself is async (1-2 frames later)
        // but its .then also calls requestRender so the selection
        // halo updates as soon as the readback lands.
        onPointerMove: (cssPx) => {
          latestMouseCss = cssPx;
        },
        // Pointer left the canvas → clear hover state.  If a point
        // is selected the card stays visible (showing the pinned
        // point) — selection state is unaffected.
        onPointerLeave: () => {
          latestMouseCss = null;
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
          tweens.cancel();
          pointerDown = true;
          setHovered(null);
        },
        onPointerUp: () => {
          pointerDown = false;
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

      detachControls = attachOrbitControls(canvas, cam, {
        onCameraChange: () => {
          // Camera moved — wake the render loop for one frame.
          // Auto-LOD recompute, scale-bar refresh, and pick gate all
          // run inside the next frame body.
          scheduler.requestRender();
        },
        onClick: (xCss, yCss) => {
          // Run a one-shot pick at the click position.  We don't use
          // the throttle guard here — clicks are infrequent and we
          // want an immediate, synchronous-feeling response.
          if (!renderer || clouds.size === 0 || !clickResolver) return;

          // Snapshot the renderer's per-source draw records and
          // filter by the current visibility mask so the pick pass
          // sees the same surveys the visual pass just rendered.  We
          // materialise to an array so the iterator survives the
          // async pick promise.
          const visibleSources = Array.from(renderer.loadedSources()).filter(
            (s) => ((visibleSourceMask >> s.source) & 1) !== 0,
          );
          if (visibleSources.length === 0) return;

          clickResolver
            .resolveClick({
              pickXPx: cssToTexPx(xCss),
              pickYPx: cssToTexPx(yCss),
              viewportPx: [canvas.width, canvas.height],
              visibleSources,
              uniformBuffer: renderer.uniformBuffer,
            })
            .then((result) => {
              // Click on empty space → clear; click on point → pin it.
              // Either path selects (or clears) by global index — the
              // resolved PointInfo is currently unused at the call
              // site, but keeping it on the result lets a future
              // "auto-focus on click" feature reuse the resolution
              // without a second pick.
              if (result.kind === 'clear') {
                setSelected(null);
              } else {
                setSelected(result.globalIdx);
              }
              // Selection changed — render so the highlight halo
              // updates on the next frame.
              scheduler.requestRender();
            });
        },
      });

      // ── Status: ready ────────────────────────────────────────────────────

      // `count` here is the total number of points across every loaded
      // survey at the moment we transition to "ready".  Surveys that finish
      // loading after this point are reflected via `onCloudReady`, not via
      // an additional `onStatusChange` — the status bar's job is "we're up",
      // not "live counter".
      cb.onStatusChange({ kind: 'ready', count: renderer.totalCount(), source });

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
        pointSize: pointSizePx,
        brightness,
        autoRotate,
        galaxyTexturesEnabled,
        highlightFallback,
        realOnlyMode,
        depthFadeEnabled,
        biasMode,
        absMagLimit,
        toneMapCurve,
        exposure,
        lodMode,
        visibleSourceMask,
      });

      // ── Render loop ──────────────────────────────────────────────────────

      function frame() {
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
        if (cam && resizeCanvasToDisplay(canvas)) {
          cam.aspect = canvas.width / canvas.height;
          updatePosition(cam);
          hdrTarget.resize({ width: canvas.width, height: canvas.height });
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
        if (cam) {
          tweens.advance(cam, performance.now());
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
        if (cam) {
          spaceMouse.applyToCamera(cam, performance.now());
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
        if (autoRotate && cam) {
          cam.yaw += 0.000873;
          updatePosition(cam);
        }

        // Snapshot the current camera state into a combined view-projection matrix.
        const vp = cam ? computeViewProj(cam) : null;
        if (!vp || !renderer) {
          // Camera/renderer not ready yet — try again next frame.
          // (This branch only fires during the brief window between
          // engine startup and the first cloud landing; once both are
          // present it's never taken.)
          scheduler.requestRender();
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
        // In manual mode we leave `visibleSourceMask` alone so a user
        // toggle in the settings panel sticks until they explicitly
        // re-enter auto mode.
        if (cam && lodMode === 'auto') {
          const nextMask = autoLodMask(cam.distance);
          if (nextMask !== visibleSourceMask) {
            visibleSourceMask = nextMask;
            cb.onSourceMaskChange?.(nextMask);
          }
        }

        // ── Command recording ─────────────────────────────────────────────

        const encoder = device.createCommandEncoder();

        // Clear colour is pure black (r:0, g:0, b:0).
        // We use *additive* blending: starting from black (0,0,0) gives the
        // maximum dynamic range — dense overlap regions bloom bright.
        //
        // The colour attachment is the HDR rgba16float offscreen target,
        // NOT the swap chain.  Every visible pass below (points, quads,
        // disks) accumulates into this float buffer; the swap chain is
        // written exactly once at the end of the frame by the tone-map
        // pass, which compresses the HDR signal into [0, 1].  This is the
        // critical fix for cluster cores blowing out to flat white at
        // bgra8unorm — without it, additive overlap >1.0 just clips.
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: hdrTarget.view,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear', // wipe to clearValue at pass start
              storeOp: 'store', // write results to the HDR target
            },
          ],
        });

        // Upload per-frame uniforms (viewProj, viewport, selectedIndex,
        // camera position, pxPerRad) and issue the instanced draw call.
        //
        // `pointSizePx` and `brightness` come from the settings-panel closure
        // variables; they start at 2.5 and 1.0 and are updated by the handle
        // setters `setPointSize` / `setBrightness` below.  `pointSizePx` now
        // acts as a *floor*: galaxies whose apparent angular radius exceeds
        // it grow to that real disc size; far galaxies stay at the floor so
        // they remain visible as faint dots.  See points.wgsl for the math.
        //
        // selectedIndex: 0xffffffff is the sentinel for "nothing selected" —
        // the max u32 value, which can never match a real point index.
        //
        // pxPerRad = viewport.height / (2 · tan(fovY/2)) — the standard
        // pinhole conversion from radians to screen pixels.  Pre-computed on
        // the CPU because `tan` is one of the more expensive shader
        // intrinsics on mobile GPUs and the value is frame-constant.
        const drawPxPerRad =
          cam !== null
            ? canvas.height / (2 * Math.tan(cam.fovYRad / 2))
            : 1;
        const drawCamPos: Readonly<[number, number, number]> =
          cam !== null
            ? [cam.position[0], cam.position[1], cam.position[2]]
            : [0, 0, 0];
        renderer.draw(
          pass,
          vp,
          [canvas.width, canvas.height],
          pointSizePx,
          brightness,
          selectedIndex !== null ? selectedIndex : 0xffffffff >>> 0,
          visibleSourceMask,
          drawCamPos,
          drawPxPerRad,
          highlightFallback,
          realOnlyMode,
          biasMode,
          absMagLimit,
          apparentMagLimit,
          schechterMStar,
          schechterAlpha,
          depthFadeEnabled,
        );

        // ── Galaxy thumbnail pass ─────────────────────────────────────────
        //
        // The whole pipeline (atlas slot allocation, priority-queued
        // bitmap fetch, retry-storm protection, back-to-front sort, and
        // the QuadRenderer + DiskRenderer draws) is encapsulated in
        // `thumbnailSubsystem.ts`.  Engine-side we just hand it the
        // per-frame inputs the loop reads — every closure variable the
        // old inline body touched is now an explicit field on
        // `ThumbnailFrameInput`.
        //
        // We gate the call on `galaxyTexturesEnabled` so users who
        // disable thumbnails pay nothing per frame.  Side effect: the
        // subsystem's LRU clock pauses with the toggle, which is fine
        // because nothing else reads it while the toggle is off.
        if (galaxyTexturesEnabled && cam && thumbnails) {
          thumbnails.runFrame({
            cam,
            clouds,
            visibleSourceMask,
            canvasSize: { width: canvas.width, height: canvas.height },
            pass,
            viewProj: vp,
            pxPerRad: drawPxPerRad,
            camPos: drawCamPos,
            quadRenderer,
            diskRenderer,
            famousMeta,
            famousXrefs,
          });
        }

        pass.end();

        // ── HDR → swap-chain tone-map ──────────────────────────────────────
        //
        // After every additive contribution has been accumulated into the
        // HDR target, run the fullscreen tone-map post-process to
        // compress the linear-light values into the swap chain's
        // displayable range.  Both the HDR pass above and this tone-map
        // pass are encoded into the same `encoder` — they get submitted
        // together below, in order, so the GPU sees:
        //
        //   1. clear+draw into hdrTarget (points/quads/disks)
        //   2. fullscreen blit hdrTarget → swap chain (tone-map)
        //
        // Switching `toneMapCurve` between Linear / Reinhard / Asinh /
        // Gamma 2 / ACES is a single 4-byte uniform write inside the
        // pass — no pipeline rebuild, instant visual A/B.  See
        // `services/gpu/toneMapPass.ts` for the full curve descriptions.
        toneMapPass.draw(
          encoder,
          context.getCurrentTexture().createView(),
          hdrTarget.view,
          exposure,
          toneMapCurve,
        );

        // Seal the command buffer and send it to the GPU.
        device.queue.submit([encoder.finish()]);

        // ── Throttled hover pick ──────────────────────────────────────────
        //
        // Strategy: pointermove updates `latestMouseCss`; here (once per frame)
        // we check whether the mouse has moved since the last pick. If it has
        // AND no pick is already in flight, we kick off a new one.
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
          clouds.size > 0 &&
          latestMouseCss !== null &&
          latestMouseCss !== lastPickedMouseCss &&
          !pickInFlight &&
          !pointerDown // skip hover picks while a drag is in progress
        ) {
          // Snapshot the renderer's currently-visible per-source draw
          // records.  Same filter rule as the click handler — only sources
          // whose visibility bit is set are eligible to claim hover.
          const visibleSources = Array.from(renderer.loadedSources()).filter(
            (s) => ((visibleSourceMask >> s.source) & 1) !== 0,
          );
          if (visibleSources.length === 0) {
            // No surveys are visible right now (user toggled them all
            // off).  Let the loop sleep — the next setSourceVisible
            // call will wake it.
            return;
          }

          // Snapshot the position at the moment we kick off the pick.
          const pos = latestMouseCss;
          lastPickedMouseCss = pos;
          pickInFlight = true;

          pickRendererHandle!
            .pick(
              [canvas.width, canvas.height],
              cssToTexPx(pos.x),
              cssToTexPx(pos.y),
              visibleSources,
              renderer.uniformBuffer,
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
              pickInFlight = false;
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
        const stillAnimating =
          autoRotate ||
          tweens.isActive() ||
          spaceMouse.hasAxes() ||
          (thumbnails !== null && thumbnails.hasInFlightFetches());
        if (stillAnimating) scheduler.requestRender();
      }

      // Build the scheduler now that `frame` is defined, then kick off
      // the first render.  After that one frame, the loop sleeps until
      // an event handler or a setter calls scheduler.requestRender().
      scheduler = createRenderScheduler({ onFrame: frame });
      scheduler.requestRender();
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
      if (selectedIndex !== null) {
        setSelected(null);
        scheduler.requestRender();
      }
    },

    destroy() {
      // 1. Cancel any in-flight frame so we don't tick after teardown.
      scheduler.cancelRender();

      // 2. Detach every pointer/keyboard/resize listener attached via
      //    inputBindings (the module owns the bookkeeping internally).
      inputBindings?.detach();
      inputBindings = null;

      // 3. Detach orbit controls (removes its own four listeners).
      detachControls?.();
      detachControls = null;

      // 5. Release GPU resources.
      pickRendererHandle?.destroy();
      pickRendererHandle = null;
      // Tone-map pass owns a 16-byte uniform buffer; HDR target owns the
      // rgba16float texture.  Both must be released so a hot-reload /
      // remount doesn't leak a per-mount texture (~16 MB at 2× DPR 1080p).
      hdrTargetHandle?.destroy();
      hdrTargetHandle = null;
      toneMapPassHandle?.destroy();
      toneMapPassHandle = null;
      // Tear down the thumbnail subsystem (clears the atlas's evict
      // handler and aborts in-flight fetches' write-back).  The atlas's
      // GPU texture itself is released when the device is dropped —
      // the subsystem doesn't expose a destroy on it directly.
      thumbnails?.destroy();
      thumbnails = null;
      // Release the WebHID device (no-op if never connected).
      spaceMouse.destroy();

      // 6. Drop references to aid GC.
      renderer = null;
      clouds.clear();
      cam = null;
    },

    // ── Settings panel setters ─────────────────────────────────────────────
    //
    // Each setter mutates the corresponding closure variable and fires the
    // optional callback so subscribed React state stays in sync. The new
    // value takes effect on the very next rendered frame.

    setPointSize(sizePx) {
      pointSizePx = sizePx;
      cb.onPointSizeChange?.(sizePx);
      scheduler.requestRender();
    },

    setBrightness(value) {
      brightness = value;
      cb.onBrightnessChange?.(value);
      scheduler.requestRender();
    },

    setAutoRotate(enabled) {
      autoRotate = enabled;
      cb.onAutoRotateChange?.(enabled);
      // Wake the loop — if previously idle, the new autoRotate=true
      // keeps it ticking via the still-animating predicate; if
      // toggling off, this single render lets the next frame body
      // observe `autoRotate=false` and let the loop sleep.
      scheduler.requestRender();
    },

    setGalaxyTexturesEnabled(enabled) {
      // The per-frame loop reads `galaxyTexturesEnabled` directly, so the
      // toggle takes effect on the very next rendered frame — no extra
      // signalling needed.  We still echo via the optional callback so any
      // subscribed React state mirrors the engine truth (same pattern as
      // the other settings setters above).
      galaxyTexturesEnabled = enabled;
      cb.onGalaxyTexturesEnabledChange?.(enabled);
      scheduler.requestRender();
    },

    setHighlightFallback(enabled) {
      // Tints fallback-orientation rows magenta (see fragment shader).
      // Read by the per-frame draw call, so flipping it takes effect on
      // the very next rendered frame.
      highlightFallback = enabled;
      cb.onHighlightFallbackChange?.(enabled);
      scheduler.requestRender();
    },

    setRealOnlyMode(enabled) {
      // `discard`s fragments belonging to fallback rows so the user sees
      // only galaxies with measured (b/a, PA).  Same per-frame uniform
      // path as the highlight toggle.
      realOnlyMode = enabled;
      cb.onRealOnlyModeChange?.(enabled);
      scheduler.requestRender();
    },

    setDepthFadeEnabled(enabled) {
      // Toggles the per-galaxy camera-distance alpha fade — when on,
      // the fragment shader multiplies alpha by
      // `1 / (1 + (camDist / 1000Mpc)²)` so galaxies far behind the
      // origin contribute less, breaking up the depth-column saturation
      // at the centre of the catalog.  Same per-frame uniform path as
      // the other UI booleans.
      depthFadeEnabled = enabled;
      cb.onDepthFadeEnabledChange?.(enabled);
      scheduler.requestRender();
    },

    setBiasMode(mode) {
      // Forwarded into the per-frame uniform on the next draw.  The shader
      // branches on the integer value (0 = none, 1 = volume-limited, …)
      // so flipping this from devtools or the future SettingsPanel takes
      // effect on the next rendered frame without any pipeline rebuild.
      //
      // We always fire the echo callback — even when `mode === biasMode`
      // — so the UI seeds correctly on first call.  The plan calls this
      // out explicitly because `setBiasMode(BiasMode.None)` is a legitimate
      // first-frame state that must reach the SettingsPanel.
      const wasSchechter = biasMode === BiasMode.Schechter;
      const isSchechter = mode === BiasMode.Schechter;
      const wasAngular = biasMode === BiasMode.AngularReweight;
      const isAngular = mode === BiasMode.AngularReweight;
      biasMode = mode;
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
      if (!wasSchechter && isSchechter && renderer) {
        renderer
          .applySchechterMode()
          .then(() => {
            // Weights are now in the GPU buffer; the next frame will
            // pick them up.
            scheduler.requestRender();
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
      if (!wasAngular && isAngular && renderer) {
        renderer
          .applyAngularReweightMode()
          .then(() => {
            scheduler.requestRender();
          })
          .catch((err) => {
            console.error('[engine] Angular re-weight bake failed:', err);
          });
      }

      // Wake the loop so the new biasMode uniform takes effect on the
      // next rendered frame.  Schechter / angular bakes (above) also
      // call requestRender from their resolve handlers in Task 5 to
      // trigger a second render once the GPU buffers are ready.
      scheduler.requestRender();
    },

    setAbsMagLimit(absMag) {
      // Threshold used by `BiasMode.VolumeLimited`.  Galaxies with absolute
      // magnitude *fainter* than this (M > absMag, since fainter = larger
      // M) are discarded in the vertex stage.  Seeded at engine init from
      // the closure default (-19, the SDSS spec sample limit); subsequent
      // calls overwrite that.
      absMagLimit = absMag;
      cb.onAbsMagLimitChange?.(absMag);
      scheduler.requestRender();
    },

    setExposure(value) {
      // Clamp into a sane range so a runaway slider or a debug
      // console call (e.g. `setExposure(1e9)`) can't blow out the
      // float buffer or, on the lower end, multiply the HDR signal
      // by zero and produce a black frame the user can't recover
      // from.  0.05 keeps a faint signal visible; 16 is well past
      // any realistic peak (~5-10 in the densest cluster cores).
      exposure = Math.max(0.05, Math.min(16, value));
      // Echo the *clamped* value back to the UI so the slider's
      // displayed number agrees with what the shader actually uses.
      // Mirrors the setToneMapCurve / setBiasMode pattern: always
      // fire (even on no-op identical values) so the first call
      // seeds React state correctly without a separate code path.
      cb.onExposureChange?.(exposure);
      scheduler.requestRender();
    },

    setToneMapCurve(curve) {
      // Forwarded into the per-frame uniform on the next draw.  The
      // shader branches on the integer value (0=Linear, 1=Reinhard,
      // 2=Asinh, 3=Gamma2, 4=Aces) so flipping this from devtools or
      // the SettingsPanel takes effect on the next rendered frame
      // without any pipeline rebuild.
      //
      // Always fire the echo callback — even when `curve === toneMapCurve`
      // — so the UI seeds correctly on first call (mirrors the
      // setBiasMode pattern).
      toneMapCurve = curve;
      cb.onToneMapCurveChange?.(curve);
      scheduler.requestRender();
    },

    resetCamera() {
      // `cam` may be null if the engine is destroyed or the cloud hasn't
      // loaded yet.  We keep `initialCamRef` declared in the outer closure
      // (rather than scoped to the async IIFE) so that this handle method
      // can read it after the IIFE completes.  Reading `cam` at call time
      // (via the closure ref) gives us the live camera object to mutate, not
      // a stale snapshot.
      if (!cam || !initialCamRef) return;
      cam.target[0] = initialCamRef.target[0];
      cam.target[1] = initialCamRef.target[1];
      cam.target[2] = initialCamRef.target[2];
      cam.distance = initialCamRef.distance;
      cam.yaw = initialCamRef.yaw;
      cam.pitch = initialCamRef.pitch;
      updatePosition(cam);
      scheduler.requestRender();
    },

    focusOn(worldXYZ, diameterKpc) {
      // Camera may not be ready yet (cloud still loading); drop the call.
      // Same defensive pattern as resetCamera() above.
      if (!cam) return;

      // Snapshot the CURRENT camera state — not the original startup state —
      // so an in-progress tween hands off smoothly to the new one.  vec3.clone
      // copies the target tuple so future mutation of cam.target doesn't
      // corrupt the from-snapshot.
      //
      // `diameterKpc` is optional — when undefined, focusDistanceMpc()
      // falls back to its built-in 30 kpc placeholder, matching the
      // pre-v4 framing exactly.  When present, the camera ends up
      // 4× the galaxy's diameter away (close-but-not-inside framing
      // that scales naturally with size).
      tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(worldXYZ[0], worldXYZ[1], worldXYZ[2]),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(diameterKpc),
        fromYaw: cam.yaw,
        toYaw: cam.yaw, // preserve yaw — user keeps their orientation
        fromPitch: cam.pitch,
        toPitch: cam.pitch, // preserve pitch
      });
      // Kick the loop into motion — the tween's per-frame advance will
      // keep it ticking via the still-animating predicate until the
      // tween completes.
      scheduler.requestRender();
    },

    selectFamous(id) {
      // Guard: famous catalog may not be loaded yet (sidecars arrive async,
      // slightly after the point cloud).  Early return is safe — the user
      // would have to invoke the palette in the ~500 ms window before the
      // sidecar fetch resolves, which is cosmetically acceptable.
      const cloud = clouds.get(Source.Famous);
      if (!cloud) return;
      const localIdx = famousMeta.findIndex((m) => m.id === id);
      if (localIdx < 0) return;

      // Build the same PointInfo the picker would, using the live sidecars
      // so the famous block (name, description, thumbnail) populates.
      const info = buildPointInfo(cloud, localIdx, Source.Famous, famousMeta, famousXrefs);
      if (!info) return;

      // The engine's selectedIndex is GLOBAL — not per-source local — so
      // we have to compute the global index.  The renderer keeps each
      // source's instanceIdOffset; sum the famous source's offset with
      // the local idx to reconstruct the same value the picker would write.
      const offset = renderer?.instanceIdOffset(Source.Famous) ?? 0;
      const globalIdx = offset + localIdx;
      setSelected(globalIdx);

      // Tween the camera onto the galaxy — same tween as `focusOn`.
      // We inline the tween-creation here rather than calling `handle.focusOn`
      // because we're inside the object literal and `this` would be unreliable
      // at call time (depending on how App.tsx invokes the handle method).
      // Copying the tween-setup block keeps the behaviour identical.
      if (!cam) return;
      tweens.start({
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
      scheduler.requestRender();
    },

    focusOnHome() {
      // Camera or initial snapshot may not be ready yet — same pattern as
      // resetCamera.  Both must exist for a meaningful tween.
      if (!cam || !initialCamRef) return;

      tweens.start({
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(
          initialCamRef.target[0],
          initialCamRef.target[1],
          initialCamRef.target[2],
        ),
        fromDistance: cam.distance,
        toDistance: initialCamRef.distance,
        fromYaw: cam.yaw,
        toYaw: initialCamRef.yaw,
        fromPitch: cam.pitch,
        toPitch: initialCamRef.pitch,
      });
      scheduler.requestRender();
    },

    // ── LOD + per-source visibility setters ────────────────────────────────
    //
    // These two methods are the public seam for the survey-toggle UI
    // (Task #37 / settings panel).  They are kept tiny on purpose: the
    // engine is the source of truth for `lodMode` and `visibleSourceMask`,
    // React just mirrors them via the optional callbacks.

    setLodMode(mode) {
      if (mode === lodMode) return;
      lodMode = mode;
      cb.onLodModeChange?.(mode);
      scheduler.requestRender();
    },

    setSourceVisible(source, visible) {
      // A user explicitly toggling one survey is the strongest possible
      // signal that they want manual control.  Auto-LOD would clobber the
      // mask on the very next frame, so we proactively flip into manual
      // mode here rather than making the caller orchestrate two calls.
      if (lodMode !== 'manual') {
        lodMode = 'manual';
        cb.onLodModeChange?.('manual');
      }

      const next = visible
        ? maskWith(visibleSourceMask, source)
        : maskWithout(visibleSourceMask, source);
      if (next === visibleSourceMask) return;
      visibleSourceMask = next;
      cb.onSourceMaskChange?.(next);
      scheduler.requestRender();
    },

    // ── SpaceMouse 6DOF input setters ─────────────────────────────────────
    //
    // Thin pass-throughs to the subsystem.  The lazy-construction and
    // axes-cache management both live inside `spaceMouseSubsystem.ts`;
    // here we just unwrap the `{ ok }` envelope to keep the public
    // EngineHandle type unchanged (Promise<boolean>).

    async connectSpaceMouse() {
      const result = await spaceMouse.connect();
      return result.ok;
    },

    disconnectSpaceMouse() {
      spaceMouse.disconnect();
      // Wake one frame so the still-animating predicate sees the
      // freshly-zeroed axes and lets the loop sleep cleanly.
      scheduler.requestRender();
    },

    isSpaceMouseConnected() {
      return spaceMouse.isConnected();
    },

    setSpaceMouseSensitivity(value) {
      spaceMouse.setSensitivity(value);
    },
  };

  return handle;
}
