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

import { initGpu, resizeCanvasToDisplay } from './gpu/device';
import { PointRenderer } from './gpu/pointRenderer';
import { createPickRenderer } from './gpu/pickRenderer';
import { createOrbitCamera, computeViewProj, updatePosition } from './camera/orbitCamera';
import { attachOrbitControls } from './camera/orbitControls';
import { generateSyntheticCloud } from './data/synthetic';
import { decodePointCloud } from './data/pointCloudFormat';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  sdssName,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyTypeFromColor,
  sdssExplorerUrl,
  sdssThumbnailUrl,
} from './utils/math';
import { formatDistance } from './utils/format/distance';
import { ALL_VISIBLE_MASK, Source, maskWith } from './data/sources';
import type { PointCloud } from './@types';
import type { PointInfo, ScaleInfo, EngineStatus, EngineCallbacks, EngineHandle } from './@types';

// ─── Auto-LOD heuristic ─────────────────────────────────────────────────────────

/**
 * Pick which surveys should be visible at a given camera distance from the
 * origin, returning a `Source` bitmask.
 *
 * The renderer evaluates per-point visibility on the GPU via a single
 * `mask & (1 << source)` test (see `data/sources.ts`), so the work this
 * function does — choosing the *right* mask for the current zoom level —
 * is essentially free at draw time.
 *
 * ### Why three bands instead of a smooth blend?
 *
 * Each survey has a real, physical effective depth (see `MAX_DIST_MPC` in
 * `data/sources.ts`). There's no value in showing 2MRS at 5000 Mpc — its
 * deepest galaxies sit around 250 Mpc, so beyond that it contributes
 * nothing but a tiny wedge of dots near the centre. Conversely SDSS is
 * sparse at < 200 Mpc — it's a *deep* survey, not a *nearby* one, and
 * showing it up close just adds noise to the local-universe view.
 *
 * Three discrete bands map the camera's zoom intent to surveys whose
 * coverage is actually relevant:
 *
 * - **< 200 Mpc — local view.**  2MRS (~250 Mpc effective depth) and GLADE
 *   are the nearby all-sky catalogs; they dominate the local universe
 *   (GLADE's parent merge of 2MPZ + 6dFGS + HyperLEDA fills in 2MRS's
 *   thin near regions). SDSS is hidden because it contributes almost
 *   nothing this close in.
 * - **200–800 Mpc — mid range.**  This is the overlap zone where every
 *   catalog has meaningful coverage, so we render all of them
 *   (`ALL_VISIBLE_MASK`) for the richest possible view.
 * - **> 800 Mpc — deep view.**  Only SDSS reaches this far (effective
 *   depth ~3000 Mpc); the others would be reduced to a barely-visible
 *   speck at the centre, so we drop them.
 *
 * **Synthetic is always included.**  When the real `.bin` file is missing
 * the engine falls back to a procedurally-generated cloud (see
 * `loadCloud`). If we ever masked Synthetic out in any band, the fallback
 * would silently disappear from view and the canvas would look empty —
 * exactly when the user most needs *something* visible. Keeping it on at
 * every distance costs nothing for real-data renders (the bit is set but
 * no points carry `Source.Synthetic`) and keeps the fallback robust.
 *
 * @param distanceMpc — current camera distance from the origin, in Mpc.
 * @returns a `Source` bitmask suitable for the GPU visibility uniform.
 */
export function autoLodMask(distanceMpc: number): number {
  // Always start from a mask that includes Synthetic — see docstring for why.
  const synthetic = maskWith(0, Source.Synthetic);

  if (distanceMpc < 200) {
    // Local view: only the nearby all-sky surveys contribute meaningfully.
    // We keep GLADE in the close-up band even though its effective depth is
    // much greater (~1.5 Gpc) — its low-redshift end overlaps 2MRS and helps
    // fill in regions where 2MRS's K_s flux limit leaves the volume sparse.
    return maskWith(maskWith(synthetic, Source.TwoMRS), Source.Glade);
  }

  if (distanceMpc <= 800) {
    // Mid range: every survey overlaps this zone, so show everything.
    // ALL_VISIBLE_MASK already includes Synthetic, so no explicit OR needed.
    return ALL_VISIBLE_MASK;
  }

  // Deep view: only SDSS reaches out this far.
  return maskWith(synthetic, Source.SDSS);
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Return the maximum absolute value of any coordinate component in the cloud's
 * positions array.
 *
 * We use *max abs of any component* rather than computing a true bounding
 * radius (which would require a sqrt per point). For camera-distance purposes
 * this is a heuristic — slightly over-estimating is harmless — and avoiding
 * sqrt keeps this O(N) scan as cheap as possible.
 *
 * The result is used to auto-frame the camera so any cloud (real SDSS or
 * synthetic sphere) is comfortably visible regardless of its spatial extent.
 */
function maxAbsCoord(cloud: PointCloud): number {
  let m = 0;
  for (let i = 0; i < cloud.positions.length; i++) {
    const v = Math.abs(cloud.positions[i]!);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Round `x` down to the nearest "nice" number from the {1, 2, 5} × 10^k family.
 *
 * This is the same rounding scheme used by axis tickers in plotting libraries
 * (matplotlib's MaxNLocator, d3's ticks(), etc.). Given any positive real, it
 * returns the largest "round" value ≤ x where round means the mantissa is one
 * of 1, 2, or 5. Examples:
 *
 *     niceRound(  3.7) →   2     (3.7 → mantissa 3.7 → rounds down to 2)
 *     niceRound( 47)   →  20     (47 → 4.7 × 10¹ → 2 × 10¹)
 *     niceRound(800)   → 500     (800 → 8 × 10² → 5 × 10²)
 *     niceRound(  0.07)→   0.05  (0.07 → 7 × 10⁻² → 5 × 10⁻²)
 *
 * Why floor (not nearest)? For a scale bar we want the *bar to fit inside* the
 * desired pixel target, never overflow it. Rounding down to the nice value
 * below the target guarantees the rendered bar is ≤ targetPx.
 */
function niceRound(x: number): number {
  if (x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const power = Math.pow(10, exp);
  const mantissa = x / power; // ∈ [1, 10)
  const niceMantissa = mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1;
  return niceMantissa * power;
}

/** Discriminated source tag returned by `loadCloud`. */
type CloudSource = 'sdss.bin' | 'synthetic';

/**
 * Attempt to load the pre-built SDSS binary at `/data/sdss.bin`.
 *
 * If the fetch succeeds and the file decodes cleanly, returns the real galaxy
 * cloud with `source: 'sdss.bin'`. On any failure (404, network error, bad
 * magic bytes, etc.) logs a warning and falls back to a 100k synthetic cloud
 * so the app remains functional without the data file.
 */
async function loadCloud(): Promise<{ cloud: PointCloud; source: CloudSource }> {
  try {
    const res = await fetch('/data/sdss.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const cloud = decodePointCloud(buf);
    return { cloud, source: 'sdss.bin' };
  } catch (err) {
    console.warn('SDSS bin not available; using synthetic fallback.', err);
    return { cloud: generateSyntheticCloud(100_000), source: 'synthetic' };
  }
}

/**
 * Build a `PointInfo` value from raw cloud arrays for the given index.
 *
 * This is the only place in the engine that touches `cartesianToRaDecZ` and
 * the physics helpers — the React components receive the computed result and
 * never import data modules directly.  The computation is intentionally
 * concentrated here so the data→display path is easy to trace and test.
 *
 * The function is called at most once per hover/select event (not per frame),
 * so the modest cost of the trig + physics math is not on the hot path.
 */
function buildPointInfo(cloud: PointCloud, idx: number): PointInfo {
  const px = cloud.positions[idx * 3 + 0]!;
  const py = cloud.positions[idx * 3 + 1]!;
  const pz = cloud.positions[idx * 3 + 2]!;

  // Recover sky coordinates from the Cartesian position stored in the cloud.
  // cartesianToRaDecZ inverts the Hubble-law conversion used at import time.
  const [ra, dec, redshift] = cartesianToRaDecZ(px, py, pz);

  // Euclidean distance in Mpc — same as the comoving distance under Hubble's law.
  const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

  // Pull all five photometric bands.  The `!` non-null assertions are safe here
  // because all mag arrays are guaranteed to have `count` elements (enforced by
  // the decoder and generator), and idx is always a valid pick result in [0, count).
  const magU = cloud.magU[idx]!;
  const magG = cloud.magG[idx]!;
  const magR = cloud.magR[idx]!;
  const magI = cloud.magI[idx]!;
  const magZ = cloud.magZ[idx]!;

  // u−r colour index is the standard SDSS discriminator for the red-sequence /
  // blue-cloud bimodality (Strateva et al. 2001). We pass it to galaxyTypeFromColor
  // rather than the u−g we feed the shader — u−r gives a cleaner separation.
  const uMinusR = magU - magR;

  return {
    index: idx,
    objID: cloud.objIDs[idx]!,

    // Sky coordinates — both decimal and pre-formatted sexagesimal strings.
    ra,
    dec,
    raSexagesimal: formatRaSexagesimal(ra),
    decSexagesimal: formatDecSexagesimal(dec),

    // Cosmology derived from the recovered redshift and distance.
    redshift,
    distanceMpc,
    hubbleVelocityKmS: hubbleVelocityKmS(redshift),
    lookbackGyr: lookbackTimeGyr(redshift),
    earthEra: earthEraForLookback(lookbackTimeGyr(redshift)),

    // Five-band photometry — raw values, let the UI format them.
    magU,
    magG,
    magR,
    magI,
    magZ,

    // Derived quantities.
    absoluteMagG: absoluteMagnitude(magG, distanceMpc),
    galaxyType: galaxyTypeFromColor(uMinusR),
    sdssName: sdssName(ra, dec),

    // External URLs — always constructed, regardless of real vs. synthetic data.
    explorerUrl: sdssExplorerUrl(cloud.objIDs[idx]!),
    thumbnailUrl: sdssThumbnailUrl(ra, dec, 200),
  };
}

// ── createEngine ───────────────────────────────────────────────────────────────

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
  // These are the source of truth for the three visual settings exposed by the
  // Settings Panel. They are mutated by the public handle setters below and
  // consumed in the render loop (renderer.draw) and frame tick (autoRotate).
  let pointSizePx = 2.5;
  let brightness = 1.0;
  let autoRotate = false;

  // ── Source visibility bitmask ───────────────────────────────────────────
  //
  // 32-bit bitmask gating which surveys are drawn each frame; one bit per
  // `Source` enum value. The renderer iterates its `loadedSources()` and
  // skips any whose bit is clear. Default = `ALL_VISIBLE_MASK` so we
  // preserve the existing "draw everything that is loaded" behaviour until
  // a UI control or auto-LOD logic (Task 5) takes over.
  let visibleSourceMask = ALL_VISIBLE_MASK;

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

  // RAF handle — stored so `destroy()` can cancel the loop cleanly.
  let rafId = 0;

  // Cloud is null until async load completes; pick/hover paths guard against null.
  let cloud: PointCloud | null = null;

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
    cb.onHoverChange(idx !== null && cloud ? buildPointInfo(cloud, idx) : null);
  }

  /**
   * Notify the UI if the selected point changed.
   */
  function setSelected(idx: number | null): void {
    if (idx === selectedIndex) return;
    selectedIndex = idx;
    cb.onSelectChange(idx !== null && cloud ? buildPointInfo(cloud, idx) : null);
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

      // Signal loading state immediately so the user knows something is
      // happening before the (potentially multi-second) fetch completes.
      cb.onStatusChange({ kind: 'loading' });

      // Fetch /data/sdss.bin; fall back to synthetic on any error.
      // loadCloud catches its own fetch/decode errors and always resolves —
      // no outer try/catch needed here.
      const result = await loadCloud();
      cloud = result.cloud;
      const source: CloudSource = result.source;

      // Until the multi-survey loader (Task 6) splits the .bin file into
      // per-source clouds, we upload the whole cloud under whichever Source
      // matches the file we got: real SDSS data → Source.SDSS, synthetic
      // fallback → Source.Synthetic. The renderer's per-source bookkeeping
      // is identical regardless — this just labels the buffer correctly so
      // future task wiring (visibility mask, picker decoding) stays consistent.
      const initialSource = result.source === 'sdss.bin' ? Source.SDSS : Source.Synthetic;
      renderer.upload(initialSource, cloud);

      // Build the pick renderer. It shares the same vertex/uniform buffers as
      // the visual renderer — no extra GPU memory for point data.
      pickRendererHandle = createPickRenderer(device);

      // ── Camera auto-framing ──────────────────────────────────────────────
      //
      // Rather than hardcoding `distance: 2500`, we measure the actual spatial
      // extent of the loaded cloud. Real SDSS galaxies mostly live at z ≈ 0.1–0.7
      // → ~430–3000 Mpc, so the bounding box varies depending on the sample.
      //
      // `bbox` = max abs of any coordinate component (cheap; no sqrt).
      // `distance` = bbox × 2.5 — 2.5× the half-extent frames the cloud with a
      //   comfortable margin similar to the old synthetic framing.
      // `far`      = bbox × 4 — ensures the most distant points aren't clipped.
      const bbox = maxAbsCoord(cloud);
      const camDistance = bbox * 2.5;
      const camFar = bbox * 4;

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
          if (!renderer || !cloud || !pickRendererHandle) return;

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

      cb.onStatusChange({ kind: 'ready', count: cloud.count, source });

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
          cloud &&
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
      cloud = null;
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

    resetCamera() {
      // `cam` may be null if the engine is destroyed or the cloud hasn't
      // loaded yet. `initialCam` is captured inside the async IIFE and
      // therefore not in scope here — we rely on the closure reference to
      // the outer `cam` variable plus the saved initial values stored in the
      // IIFE-local `initialCam` constant. Because this method closes over the
      // outer `cam` ref, we read it at call time (which is correct: we want
      // to mutate the live camera object, not a stale snapshot).
      //
      // The `initialCam` object is not accessible here because it is declared
      // inside the async IIFE. To work around this scoping, we store it in a
      // closure variable declared alongside the other mutable state above.
      if (!cam || !initialCamRef) return;
      cam.target[0] = initialCamRef.target[0];
      cam.target[1] = initialCamRef.target[1];
      cam.target[2] = initialCamRef.target[2];
      cam.distance = initialCamRef.distance;
      cam.yaw = initialCamRef.yaw;
      cam.pitch = initialCamRef.pitch;
      updatePosition(cam);
    },
  };

  return handle;
}
