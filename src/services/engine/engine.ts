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
import {
  createOrbitCamera,
  computeViewProj,
  updatePosition,
  clampDistance,
} from '../camera/orbitCamera';
import { attachOrbitControls } from '../camera/orbitControls';
import { formatDistance } from '../../utils/format/distance';
import { ALL_VISIBLE_MASK, Source, maskWith, maskWithout } from '../../data/sources';
import type { LodMode, PointCloud } from '../../@types';
import type { EngineCallbacks, EngineHandle } from '../../@types';
import { advanceCameraTween, type CameraTween } from '../camera/cameraTween';
import { vec3 } from 'gl-matrix';

import { autoLodMask } from './autoLod';
import { buildPointInfo, maxAbsCoord, niceRound } from './pointInfoBuilder';
import { loadAllClouds, buildSyntheticFallback, type CloudSource } from './cloudLoader';
import { FOCUS_TWEEN_MS, focusDistanceMpc } from './focusTween';

// ── Galaxy thumbnail subsystem imports ────────────────────────────────────
//
// Pulled in here so the per-frame loop can drive the atlas, the priority
// queue, and the textured-quad pass.  The math helpers come from utils/math:
// `apparentSizePx` decides whether a galaxy is big enough on screen to be
// worth a thumbnail, `galaxyDiameterKpc` is the physical-size estimator
// (constant 30 kpc in v1), and `cartesianToRaDecZ` recovers sky coordinates
// from the Cartesian positions stored in the PointCloud (we need RA/Dec to
// build the cutout URL).
import { TextureAtlas } from '../gpu/textureAtlas';
import { GalaxyImageQueue } from '../gpu/galaxyImageQueue';
import { QuadRenderer } from '../gpu/quadRenderer';
import { fetchGalaxyBitmap } from '../gpu/galaxyImageFetcher';
import { apparentSizePx, galaxyDiameterKpc, cartesianToRaDecZ } from '../../utils/math';
import type { QuadInstance } from '../../@types';

// ── SpaceMouse 6DOF input (optional, WebHID-only) ────────────────────────────
//
// These imports are unconditionally pulled in because tree-shaking a few
// hundred bytes of pure helpers isn't worth the conditional-import
// complexity. The actual WebHID call (and the hardware coupling) only fires
// when the user hits the "Connect SpaceMouse" button — see `SpaceMouseInput`
// further down in the engine state block.
import { SpaceMouseInput } from '../input/spaceMouse';
import { applyCurve } from '../input/spaceMouseSensitivity';
import { applyAxesToCamera, hasAnyAxis } from '../input/spaceMouseToCamera';
import type { SpaceMouseAxes } from '../input/spaceMouseAxes';
import { ZERO_AXES } from '../input/spaceMouseAxes';

// ── Galaxy thumbnail constants ──────────────────────────────────────────────

/** Below this on-screen size, we don't bother fetching a thumbnail at all. */
const APPARENT_SIZE_THRESHOLD_PX = 24;

/**
 * Pre-filter cutoff: galaxies past this distance are never large enough on
 * screen to qualify, so we skip the full apparent-size computation.  At
 * 1000 Mpc, even a 60 kpc galaxy in a 1080-px viewport at fov 60° comes
 * out to ~6 px — well below threshold.  Saves an `apparentSizePx` call
 * per far-away galaxy per frame for ~70 % of catalogue rows.
 */
const FAR_DISTANCE_CUTOFF_MPC = 1000;

/**
 * Stable cache key for an atlas slot.  RA/Dec to 5 decimal places is
 * unique within ~0.1 arcsec — much finer than the SDSS pixel scale,
 * so two galaxies will never collide unless they're literally on top
 * of each other (in which case sharing a thumbnail is fine).
 */
function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}

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
  let pointSizePx = 2.5;
  let brightness = 1.0;
  let autoRotate = false;
  // Galaxy-thumbnail master toggle.  Hoisted to the outer createEngine
  // closure (rather than the inner async IIFE) so the public handle's
  // `setGalaxyTexturesEnabled` setter can read and mutate it after the
  // IIFE completes — same lifetime trick we use for `cam` and
  // `initialCamRef` further down.
  let galaxyTexturesEnabled = true;

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
  let visibleSourceMask = ALL_VISIBLE_MASK;
  let lodMode: LodMode = 'auto';

  // ── Initial camera snapshot ───────────────────────────────────────────────
  //
  // Written once by the async IIFE after the cloud loads and bbox is known.
  // Read by `resetCamera()` in the public handle. Declared here (outside the
  // IIFE) so the public handle's closure can reach it without hoisting the
  // entire async block.
  type InitialCam = {
    target: [number, number, number];
    distance: number;
    yaw: number;
    pitch: number;
    fovYRad: number;
    near: number;
    far: number;
  };
  let initialCamRef: InitialCam | null = null;

  // ── In-flight focus / home tween ────────────────────────────────────────
  //
  // At most one tween at a time.  Starting a new focus or home cancels the
  // running one (we replace this reference; the old tween descriptor is just
  // GC'd).  Set to null when no tween is active.  Mutated by:
  //   - the public handle's `focusOn` / `focusOnHome` (start a tween)
  //   - the `pointerdown` handler           (cancel on user grab)
  //   - the per-frame `frame()` loop         (clear when finished)
  let currentTween: CameraTween | null = null;

  // ── SpaceMouse state ────────────────────────────────────────────────────
  //
  // `latestSpaceMouseAxes` holds the most recent reading from the WebHID
  // listener. The render loop reads it every frame; if any axis is non-zero
  // we apply it to the camera (and cancel any active tween, same precedence
  // rule as a mouse drag).
  //
  // `spaceMouseSensitivity` is the user-controlled global scalar from the
  // settings panel (default 1.0). It's applied AFTER the cube curve so the
  // curve shape stays constant.
  //
  // `lastSpaceMouseFrameMs` lets us scale the per-frame application by the
  // wall-clock delta — display refresh rates vary (60 / 120 / 144 Hz) and
  // we want consistent motion across them. Initialised lazily on first use.
  let latestSpaceMouseAxes: SpaceMouseAxes = { ...ZERO_AXES };
  let spaceMouseSensitivity = 1.0;
  let lastSpaceMouseFrameMs: number | null = null;
  // The SpaceMouseInput instance is created lazily on the first call to
  // connectSpaceMouse(); on construction it also tries to silently
  // re-acquire any previously-paired device. Keeping it lazy means the
  // WebHID API is never touched on browsers that don't support it.
  let spaceMouseInput: SpaceMouseInput | null = null;

  // RAF handle — stored so `destroy()` can cancel the loop cleanly.
  let rafId = 0;

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
    return buildPointInfo(c, resolved.localIdx, resolved.source);
  }

  // Renderer and pickRenderer are null until GPU init completes.
  let renderer: PointRenderer | null = null;
  let pickRendererHandle: ReturnType<typeof createPickRenderer> | null = null;

  // Cleanup function returned by `attachOrbitControls`.
  let detachControls: (() => void) | null = null;

  // Listeners attached to window/canvas — collected here so `destroy()` can
  // remove them all in one place.
  const windowListeners: Array<[keyof WindowEventMap, EventListener]> = [];
  const canvasListeners: Array<[string, EventListener]> = [];

  function addWindowListener<K extends keyof WindowEventMap>(
    type: K,
    handler: (e: WindowEventMap[K]) => void,
  ): void {
    window.addEventListener(type, handler as EventListener);
    windowListeners.push([type, handler as EventListener]);
  }

  function addCanvasListener(type: string, handler: EventListener): void {
    canvas.addEventListener(type, handler);
    canvasListeners.push([type, handler]);
  }

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
   * Compute the scale bar's label and pixel width from the current camera state,
   * then fire `onScaleChange` if either value changed.
   *
   * Math: with a perspective camera, the visible vertical world height at a
   * distance `d` from the camera is 2·d·tan(fovY/2). One world unit therefore
   * takes up  viewportHeightPx / (2·d·tan(fovY/2))  pixels at distance d.
   * We measure at the focal point (camera target) — close enough for a heuristic
   * legend, and matches what the user perceives at the centre of the screen.
   *
   * We use CSS pixels (clientHeight), not the backing-store size, so the bar's
   * physical width on screen matches the legend reading regardless of DPR.
   */
  function updateScaleBar(): void {
    if (!cam) return;

    const viewportCssHeight = canvas.clientHeight;
    if (viewportCssHeight === 0) return;

    const pxPerMpc = viewportCssHeight / (2 * cam.distance * Math.tan(cam.fovYRad / 2));
    if (!isFinite(pxPerMpc) || pxPerMpc <= 0) return;

    const desiredMpc = SCALE_TARGET_PX / pxPerMpc;
    const niceMpc = niceRound(desiredMpc);
    const widthPx = niceMpc * pxPerMpc;

    const sig = `${niceMpc}:${widthPx.toFixed(0)}`;
    if (sig === lastScaleSig) return;
    lastScaleSig = sig;

    cb.onScaleChange({
      label: formatDistance(niceMpc),
      widthPx: Math.round(widthPx),
    });
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

      // Build the GPU pipeline; cloud data is loaded below.
      renderer = new PointRenderer(device, format);

      // ── Galaxy thumbnail subsystem ─────────────────────────────────────
      //
      // Three collaborators wired together here:
      //
      //   - atlas:        owns the GPU texture and slot bookkeeping.
      //   - queue:        priority/concurrency-limited bitmap fetcher.
      //   - quadRenderer: textured-quad render pass running after the
      //                   point pass each frame.
      //
      // `galaxyTexturesEnabled` is mutated by the SettingsPanel toggle
      // wired in Task 10.  `frameCounter` ticks once per frame and feeds
      // the atlas's LRU clock (allocate / lastSeenFrame).  `bitmapReady`
      // tracks which keys have a usable bitmap loaded — we don't emit a
      // QuadInstance for a slot until its bitmap has arrived (otherwise
      // we'd be sampling whichever galaxy used to occupy that slot, OR
      // a blank cleared region of the atlas).
      //
      // The QuadRenderer constructor wants a GpuContext; we have the
      // four constituents in scope, so we build one inline rather than
      // restructuring initGpu's return signature.
      //
      // Known v1 limitation: when LRU evicts a key from the atlas,
      // `bitmapReady` doesn't get cleaned up, so a re-allocated key
      // would skip its re-fetch and briefly render whatever bitmap was
      // last uploaded to that slot.  Acceptable for v1 — at most one
      // frame of stale-slot sampling per re-allocation.  A follow-up
      // can add an `onEvict` hook on the atlas to plug this.
      const atlas = new TextureAtlas(device);
      atlas.initTexture();
      const quadRenderer = new QuadRenderer({ device, context, format, canvas });
      quadRenderer.bindAtlas(atlas.getTextureView());
      const queue = new GalaxyImageQueue();
      let frameCounter = 0;
      const bitmapReady = new Set<string>();

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

        renderer.upload(result.source, result.cloud);
        clouds.set(result.source, result.cloud);
        cb.onCloudReady?.(result.source, result.cloud.count);

        if (firstResult === null) {
          firstResult = result;
        }
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
          renderer.upload(fallback.source, fallback.cloud);
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

      // ── Camera auto-framing ──────────────────────────────────────────────
      //
      // Frame to whichever cloud arrived first (see comment above).  Each
      // survey has a very different effective depth — 2MRS ~250 Mpc, GLADE
      // ~1.5 Gpc, SDSS ~3 Gpc — and using the first arrival's bbox tends
      // to give the closest "natural" view to start exploring from, with
      // the auto-LOD kicking surveys in/out as the user zooms.
      //
      // `bbox` = max abs of any coordinate component (cheap; no sqrt).
      // `distance` = bbox × INITIAL_FRAME_FACTOR — frames the cloud with a
      //   comfortable margin.  Lowered from 2.5 to 1.6 so first-time visitors
      //   land already inside the cluster structure rather than far above it.
      // `far`      = bbox × 4 — ensures the most distant points aren't clipped.
      // We deliberately use the LARGEST bbox seen so far across loaded
      // clouds so the far plane covers every survey's outermost galaxy —
      // otherwise SDSS's deep galaxies would clip when 2MRS framed first.
      const INITIAL_FRAME_FACTOR = 1.6;
      let bbox = maxAbsCoord(firstResult.cloud);
      for (const c of clouds.values()) {
        const cb2 = maxAbsCoord(c);
        if (cb2 > bbox) bbox = cb2;
      }
      // Clamp to the global zoom envelope so an oversized SDSS bbox can't
      // start the user above MAX_DISTANCE_MPC (the wheel would then be locked).
      const camDistance = clampDistance(bbox * INITIAL_FRAME_FACTOR);
      const camFar = bbox * 4;
      const source: CloudSource = firstResult.cloudSource;

      cam = createOrbitCamera({
        target: [0, 0, 0],
        distance: camDistance,
        yaw: 0,
        pitch: 0.3,
        fovYRad: (Math.PI / 180) * 60,
        aspect: canvas.width / canvas.height,
        near: 1,
        far: camFar,
      });

      // ── Initial camera snapshot for resetCamera() ────────────────────────
      //
      // We capture the initial framing values now, after the cloud is loaded and
      // bbox is known, so `resetCamera()` can restore them at any later time.
      // fovYRad / near / far are copied from `cam` so a future reconfigure of
      // the camera (e.g. new data file) would naturally be reflected here.
      // `aspect` is NOT stored here — reset should use the *current* canvas
      // aspect ratio so the projection is correct after a window resize.
      //
      // Assigned to the outer `initialCamRef` so the public `resetCamera()` handle
      // method can read it after this async block completes.
      initialCamRef = {
        target: [0, 0, 0],
        distance: camDistance, // bbox * 2.5
        yaw: 0,
        pitch: 0.3,
        fovYRad: cam.fovYRad,
        near: cam.near,
        far: cam.far,
      };

      // ── Pointer event listeners ──────────────────────────────────────────

      // Track latest mouse position for the per-frame throttled hover pick.
      addCanvasListener('pointermove', (e) => {
        const pe = e as PointerEvent;
        latestMouseCss = { x: pe.clientX, y: pe.clientY };
      });

      // When the pointer leaves the canvas, clear hover state.
      // If a point is selected the card will remain visible (showing pinned point).
      addCanvasListener('pointerleave', () => {
        latestMouseCss = null;
        setHovered(null);
      });

      // ── Drag detection (suppress hover picks during camera rotation) ─────
      //
      // We listen on `window` for pointerup so we still see the release even
      // when `setPointerCapture` has routed events back to the canvas via the
      // orbit-controls module.
      //
      // On pointerdown we also clear the current hover so the card immediately
      // reflects "nothing hovered" instead of lagging until the drag ends.
      addCanvasListener('pointerdown', () => {
        // Manual orbit controls always win — cancel any running focus tween
        // the moment the user grabs the mouse.  Otherwise the tween's
        // updatePosition would fight the orbit-controls' updatePosition for
        // the same camera each frame, producing a juddery jump.
        currentTween = null;
        pointerDown = true;
        setHovered(null);
      });
      addWindowListener('pointerup', () => {
        pointerDown = false;
      });
      // Defensive: if the OS cancels the gesture, release the suppression flag.
      addWindowListener('pointercancel', () => {
        pointerDown = false;
      });

      // ── Click handling ───────────────────────────────────────────────────
      //
      // Click detection is delegated to `attachOrbitControls` via the `onClick`
      // option. A "click" fires only when pointerup is within 4 CSS pixels of
      // pointerdown — pure drags (orbit gestures) are suppressed.

      detachControls = attachOrbitControls(canvas, cam, {
        onClick: (xCss, yCss) => {
          // Run a one-shot pick at the click position.
          // We don't use the throttle guard here — clicks are infrequent and
          // we want an immediate, synchronous-feeling response.
          if (!renderer || clouds.size === 0 || !pickRendererHandle) return;

          // Snapshot the renderer's per-source draw records and filter by
          // the current visibility mask so the pick pass sees the same
          // surveys the visual pass just rendered. We materialise to an
          // array so the iterator survives the async pick promise.
          const visibleSources = Array.from(renderer.loadedSources()).filter(
            (s) => ((visibleSourceMask >> s.source) & 1) !== 0,
          );
          if (visibleSources.length === 0) return;

          pickRendererHandle
            .pick(
              [canvas.width, canvas.height],
              cssToTexPx(xCss),
              cssToTexPx(yCss),
              visibleSources,
              renderer.uniformBuffer,
            )
            .then((idx) => {
              // Click on empty space → clear selection; click on point → pin it.
              setSelected(idx === -1 ? null : idx);
            });
        },
      });

      // ── Esc → clear selection ────────────────────────────────────────────
      //
      // The engine owns this because Esc acts on engine state (`selectedIndex`).
      // `App.tsx` also has a `useEffect` that forwards Esc through the engine
      // handle's `clearSelection()` method — same result, both paths are fine.
      addWindowListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') setSelected(null);
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
      // Fire each optional settings callback once with the default value so
      // React's initial state matches the engine's defaults (pointSizePx=2.5,
      // brightness=1.0, autoRotate=false). Without this, the React state
      // initialised in App.tsx would only update on the first explicit user
      // interaction, which could leave the UI showing stale values if the
      // defaults ever change.
      cb.onPointSizeChange?.(pointSizePx);
      cb.onBrightnessChange?.(brightness);
      cb.onAutoRotateChange?.(autoRotate);
      cb.onGalaxyTexturesEnabledChange?.(galaxyTexturesEnabled);
      // LOD mode + visible-mask seeds — engine and React both default to
      // 'auto' / ALL_VISIBLE_MASK respectively, but firing the echo here
      // protects against future default drift and keeps the contract uniform
      // (every engine-owned setting React mirrors must be seeded at init).
      cb.onLodModeChange?.(lodMode);
      cb.onSourceMaskChange?.(visibleSourceMask);

      // ── Render loop ──────────────────────────────────────────────────────

      function frame() {
        // Resize the swap-chain if the canvas element changed size.
        // `resizeCanvasToDisplay` returns `true` only when dimensions changed,
        // so we patch `cam.aspect` and `updatePosition` only in that branch.
        if (cam && resizeCanvasToDisplay(canvas)) {
          cam.aspect = canvas.width / canvas.height;
          updatePosition(cam);
        }

        // Refresh the scale-bar legend. Early-returns when nothing changed,
        // so this costs ~zero on stable frames.
        updateScaleBar();

        // ── Focus / home tween ────────────────────────────────────────────
        //
        // If a tween is in flight, advance it.  `advanceCameraTween` mutates
        // the camera state and calls updatePosition internally, so by the time
        // we hit the auto-rotate block below the camera is already at the
        // eased intermediate frame.  When the tween reports finished we clear
        // the reference so subsequent frames skip this branch entirely.
        if (currentTween && cam) {
          const finished = advanceCameraTween(cam, currentTween, performance.now());
          if (finished) currentTween = null;
        }

        // ── SpaceMouse per-frame application ──────────────────────────────
        //
        // We apply the puck's latest axes every frame the puck is deflected.
        // Same precedence rule as mouse drag: any non-zero axis cancels a
        // running tween, otherwise the tween's updatePosition would fight
        // ours for the same camera state and the user would see judder.
        //
        // dt is computed against the previous SpaceMouse-active frame —
        // *not* the previous render frame — so a long stretch of zero
        // input (puck at rest) doesn't produce a giant catch-up jump on
        // the first frame the user touches it again.
        if (cam && hasAnyAxis(latestSpaceMouseAxes)) {
          const now = performance.now();
          // Clamp dt so a tab-foreground regain (after long sleep) doesn't
          // produce a multi-second jump. 50ms ≈ 3 frames at 60Hz — long
          // enough to be useful, short enough to feel snappy.
          const dt =
            lastSpaceMouseFrameMs === null
              ? 16
              : Math.min(now - lastSpaceMouseFrameMs, 50);
          lastSpaceMouseFrameMs = now;

          currentTween = null;
          const shaped = applyCurve(latestSpaceMouseAxes, spaceMouseSensitivity);
          applyAxesToCamera(cam, shaped, dt);
          updatePosition(cam);
        } else {
          // Reset the dt baseline whenever the puck is at rest, so when the
          // user re-grabs it we start a fresh dt instead of integrating
          // against a stale timestamp.
          lastSpaceMouseFrameMs = null;
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
          rafId = requestAnimationFrame(frame);
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
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear', // wipe to clearValue at pass start
              storeOp: 'store', // write results to the swap-chain texture
            },
          ],
        });

        // Upload per-frame uniforms (viewProj, viewport, selectedIndex) and
        // issue the instanced draw call.
        //
        // `pointSizePx` and `brightness` come from the settings-panel closure
        // variables; they start at 2.5 and 1.0 and are updated by the handle
        // setters `setPointSize` / `setBrightness` below.
        //
        // selectedIndex: 0xffffffff is the sentinel for "nothing selected" —
        // the max u32 value, which can never match a real point index.
        renderer.draw(
          pass,
          vp,
          [canvas.width, canvas.height],
          pointSizePx,
          brightness,
          selectedIndex !== null ? selectedIndex : 0xffffffff >>> 0,
          visibleSourceMask,
        );

        // ── Galaxy thumbnail pass ─────────────────────────────────────────
        //
        // Walk every loaded cloud and select galaxies that pass the apparent-
        // size threshold.  For each surviving galaxy: allocate (or refresh) an
        // atlas slot, kick off a fetch if no bitmap has landed yet, and emit
        // a QuadInstance once the bitmap is ready.  The QuadRenderer issues
        // its draw call in the same render pass so the quads composite over
        // the dot field with the existing premultiplied-alpha blend.
        //
        // `frameCounter` is incremented unconditionally — even when the
        // toggle is off — so when the user re-enables thumbnails the LRU
        // clock isn't frozen at the moment they last toggled.  (Cheap: one
        // increment per frame.)
        frameCounter++;

        if (galaxyTexturesEnabled && cam) {
          const fovYRad = cam.fovYRad;
          const viewportH = canvas.height;

          const quads: QuadInstance[] = [];
          for (const cloud of clouds.values()) {
            for (let i = 0; i < cloud.count; i++) {
              const x = cloud.positions[i * 3 + 0]!;
              const y = cloud.positions[i * 3 + 1]!;
              const z = cloud.positions[i * 3 + 2]!;

              // Pre-filter by distance from the origin.  This isn't the
              // distance the apparent-size formula uses (that's camera-to-
              // galaxy, computed below), but galaxies far enough from the
              // origin are also far from any plausible camera position
              // inside the cloud, so this skips the bulk of catalogue rows
              // before we touch the more expensive math.
              const distFromOrigin = Math.hypot(x, y, z);
              if (distFromOrigin <= 0 || distFromOrigin > FAR_DISTANCE_CUTOFF_MPC) continue;

              // Distance from CAMERA, not target.  Apparent size depends on
              // the viewer-to-galaxy distance, not the target-to-galaxy
              // distance — they only coincide when the camera is looking
              // straight at a galaxy from far away.
              const dx = cam.position[0] - x;
              const dy = cam.position[1] - y;
              const dz = cam.position[2] - z;
              const camDist = Math.hypot(dx, dy, dz);
              if (camDist <= 0) continue;

              const dKpc = galaxyDiameterKpc({}); // v1: constant 30 kpc
              const px = apparentSizePx({
                diameterKpc: dKpc,
                distanceMpc: camDist,
                viewportHeightPx: viewportH,
                fovYRad,
              });
              if (px < APPARENT_SIZE_THRESHOLD_PX) continue;

              // Recover RA/Dec for the cutout URL.  The PointCloud doesn't
              // store sky coords — only Cartesian Mpc — so we invert the
              // Hubble-law conversion that was applied at import time.
              // Returns [ra, dec, redshift] but we only need the first two.
              const [ra, dec] = cartesianToRaDecZ(x, y, z);
              const key = galaxyCacheKey(ra, dec);

              // Allocate (or refresh) an atlas slot.  Idempotent for repeat
              // frames — same key returns the same slot index and just bumps
              // the LRU clock so the entry isn't evicted while still on
              // screen.
              const slot = atlas.allocate(key, frameCounter);

              // If we don't have a bitmap yet, kick off a fetch.  The queue
              // dedupes by key — re-enqueuing only refreshes the priority
              // (priority = apparent-size px, so big galaxies load first).
              if (!bitmapReady.has(key)) {
                queue.enqueue({
                  key,
                  priority: px,
                  fetcher: () => fetchGalaxyBitmap({ ra, dec }),
                  onResult: (bitmap) => {
                    if (!bitmap) return;
                    // Slot may have been reassigned by LRU between enqueue
                    // and fetch resolution.  `lastSeenFrame` returns
                    // undefined for keys not currently in the atlas (i.e.
                    // evicted before our async fetch resolved); in that
                    // case we just drop the bitmap.
                    if (atlas.lastSeenFrame(key) === undefined) {
                      bitmap.close();
                      return;
                    }
                    atlas.uploadBitmap(slot, bitmap);
                    bitmapReady.add(key);
                    bitmap.close();
                  },
                });
                continue; // no quad this frame — wait for the bitmap to land
              }

              // Pack the QuadInstance.  4× the physical diameter gives the
              // quad visual presence without dwarfing the surrounding dot
              // field — the texture's body fills the central ~25% of the
              // quad, with the rest fading to transparent via the alpha
              // channel of the cutout JPEG.
              const sizeWorldMpc = (dKpc / 1000) * 4;
              const [u0, v0, u1, v1] = atlas.slotUv(slot);
              quads.push({ x, y, z, sizeWorld: sizeWorldMpc, u0, v0, u1, v1 });
            }
          }

          if (quads.length > 0) {
            quadRenderer.draw(pass, vp, [canvas.width, canvas.height], quads);
          }
        }

        pass.end();

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
            rafId = requestAnimationFrame(frame);
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
            })
            .finally(() => {
              pickInFlight = false;
            });
        }

        // Schedule the next frame. `requestAnimationFrame` syncs to the display
        // refresh rate and pauses automatically when the tab is hidden.
        rafId = requestAnimationFrame(frame);
      }

      rafId = requestAnimationFrame(frame);
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
      }
    },

    destroy() {
      // 1. Cancel the render loop so no more frames are submitted.
      cancelAnimationFrame(rafId);

      // 2. Remove all canvas event listeners we registered.
      for (const [type, handler] of canvasListeners) {
        canvas.removeEventListener(type, handler);
      }
      canvasListeners.length = 0;

      // 3. Remove all window event listeners we registered.
      for (const [type, handler] of windowListeners) {
        window.removeEventListener(type, handler as EventListener);
      }
      windowListeners.length = 0;

      // 4. Detach orbit controls (removes its own four listeners).
      detachControls?.();
      detachControls = null;

      // 5. Release GPU resources.
      pickRendererHandle?.destroy();
      pickRendererHandle = null;

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
    },

    setBrightness(value) {
      brightness = value;
      cb.onBrightnessChange?.(value);
    },

    setAutoRotate(enabled) {
      autoRotate = enabled;
      cb.onAutoRotateChange?.(enabled);
    },

    setGalaxyTexturesEnabled(enabled) {
      // The per-frame loop reads `galaxyTexturesEnabled` directly, so the
      // toggle takes effect on the very next rendered frame — no extra
      // signalling needed.  We still echo via the optional callback so any
      // subscribed React state mirrors the engine truth (same pattern as
      // the other settings setters above).
      galaxyTexturesEnabled = enabled;
      cb.onGalaxyTexturesEnabledChange?.(enabled);
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
    },

    focusOn(worldXYZ) {
      // Camera may not be ready yet (cloud still loading); drop the call.
      // Same defensive pattern as resetCamera() above.
      if (!cam) return;

      // Snapshot the CURRENT camera state — not the original startup state —
      // so an in-progress tween hands off smoothly to the new one.  vec3.clone
      // copies the target tuple so future mutation of cam.target doesn't
      // corrupt the from-snapshot.
      currentTween = {
        startMs: performance.now(),
        durationMs: FOCUS_TWEEN_MS,
        fromTarget: vec3.clone(cam.target as vec3),
        toTarget: vec3.fromValues(worldXYZ[0], worldXYZ[1], worldXYZ[2]),
        fromDistance: cam.distance,
        toDistance: focusDistanceMpc(),
        fromYaw: cam.yaw,
        toYaw: cam.yaw, // preserve yaw — user keeps their orientation
        fromPitch: cam.pitch,
        toPitch: cam.pitch, // preserve pitch
      };
    },

    focusOnHome() {
      // Camera or initial snapshot may not be ready yet — same pattern as
      // resetCamera.  Both must exist for a meaningful tween.
      if (!cam || !initialCamRef) return;

      currentTween = {
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
      };
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
    },

    // ── SpaceMouse 6DOF input setters ─────────────────────────────────────
    //
    // Lazy construction: `SpaceMouseInput` is only instantiated on the first
    // `connectSpaceMouse()` call. Constructor side-effects include a call to
    // `navigator.hid.getDevices()` (silent re-acquire), which is harmless on
    // unsupported browsers thanks to the feature check inside the class.

    async connectSpaceMouse() {
      if (!spaceMouseInput) {
        spaceMouseInput = new SpaceMouseInput({
          // Just stash the latest reading — the engine's own per-frame loop
          // will pick it up. We don't apply axes here because that would tie
          // the rate of camera updates to the device's report rate (which can
          // exceed display refresh) instead of the frame loop.
          onAxes: (axes) => {
            latestSpaceMouseAxes = axes;
          },
          // Forward connection-state transitions to the engine's callback so
          // React's "Connected" indicator drops back to false if the puck is
          // physically unplugged or browser permission is revoked.  The
          // SpaceMouseInput class already listens for the HID `disconnect`
          // event; we just relay it.
          onConnectionChange: (connected) => {
            cb.onSpaceMouseConnectedChange?.(connected);
            // Wipe the cached axes on disconnect so the per-frame loop stops
            // applying the last reading received before we lost the device.
            if (!connected) latestSpaceMouseAxes = { ...ZERO_AXES };
          },
        });
      }
      return spaceMouseInput.connect();
    },

    disconnectSpaceMouse() {
      spaceMouseInput?.disconnect();
      // Reset the cached axes so the next frame doesn't continue applying
      // the last reading received before disconnect.
      latestSpaceMouseAxes = { ...ZERO_AXES };
    },

    isSpaceMouseConnected() {
      return spaceMouseInput?.isConnected() ?? false;
    },

    setSpaceMouseSensitivity(value) {
      spaceMouseSensitivity = value;
    },
  };

  return handle;
}
