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
import type { PointCloud } from './types';

// ── Public types ───────────────────────────────────────────────────────────────

/**
 * Display data for a single galaxy point, computed on-demand from the raw
 * cloud arrays.
 *
 * All derived quantities (sexagesimal coords, lookback time, galaxy type, etc.)
 * are pre-computed here in the engine so React components receive ready-to-render
 * values and never import data or physics modules directly.  The computation is
 * on-demand (triggered by hover/select events) so it costs nothing for the 99.9%
 * of points that are never hovered.
 *
 * Fields are grouped into four logical sections below.
 */
export type PointInfo = {
  /** 0-based point index in the loaded cloud. */
  index: number;

  /**
   * SDSS 64-bit object identifier.
   *
   * Stored as `bigint` because SDSS objIDs are 18–19 digit numbers that exceed
   * the safe integer range of JS `number` (2⁵³).  Used to build the Explorer
   * and thumbnail URLs below.
   */
  objID: bigint;

  /** @group Sky coordinates */

  /** Right Ascension in decimal degrees, [0, 360). */
  ra: number;
  /** Declination in decimal degrees, [-90, +90]. */
  dec: number;
  /** RA formatted as HHhMMmSS.sss (pre-computed via physics.formatRaSexagesimal). */
  raSexagesimal: string;
  /** Dec formatted as ±DD°MM'SS.s" (pre-computed via physics.formatDecSexagesimal). */
  decSexagesimal: string;

  /** @group Cosmology */

  /** Spectroscopic redshift z (dimensionless). */
  redshift: number;
  /** Comoving distance in Mpc, computed as √(x²+y²+z²). */
  distanceMpc: number;
  /** Recession velocity in km/s via Hubble's law: v = c·z. */
  hubbleVelocityKmS: number;
  /** Light-travel time in Gyr (how long ago the light we see left the source). */
  lookbackGyr: number;
  /** Human-readable Earth-history anchor for the lookback time, e.g. "during Earth's Mesoproterozoic". */
  earthEra: string;

  /** @group Five-band photometry */

  /** SDSS u-band apparent magnitude. */
  magU: number;
  /** SDSS g-band apparent magnitude — the primary brightness proxy shown in the UI. */
  magG: number;
  /** SDSS r-band apparent magnitude. */
  magR: number;
  /** SDSS i-band apparent magnitude. */
  magI: number;
  /** SDSS z-band apparent magnitude. */
  magZ: number;

  /** @group Derived quantities */

  /** Absolute magnitude in the g-band, corrected for distance. */
  absoluteMagG: number;
  /**
   * Coarse galaxy classification inferred from the u−r colour index.
   *
   * `category` is intended for UI tinting; `description` is the human-readable
   * string shown in the info card (e.g. "Red, quiescent galaxy").
   */
  galaxyType: { category: 'red' | 'blue' | 'unknown'; description: string };
  /** IAU-style SDSS designation, e.g. "SDSS J123456.75+012345.5". */
  sdssName: string;

  /** @group External URLs */

  /**
   * SDSS DR18 Quick Look page for this object (opens in a new tab).
   *
   * For synthetic data the objID is sequential (0, 1, 2…) so the URL won't
   * resolve to a real page — but the field is always populated so the render
   * path is uniform.
   */
  explorerUrl: string;
  /**
   * SDSS image cutout URL — a 200×200 px JPEG centred on the object's sky position.
   *
   * The cutout service is coordinate-based (RA/Dec), not objID-based, so it
   * works for both real SDSS data and synthetic points whose positions have
   * plausible sky coordinates.
   */
  thumbnailUrl: string;
};

/**
 * Distance scale for the bottom-right legend bar.
 *
 * The engine computes this from the camera distance and viewport height each
 * frame, deduplicates on `label + widthPx`, and fires `onScaleChange` only
 * when the value actually changes. React components receive it as props and
 * render it directly — no derived state needed.
 */
export type ScaleInfo = {
  /**
   * Pre-formatted human-readable label, e.g. "500 Mpc", "2 Gpc", "750 kpc".
   * Includes the unit suffix — render as plain text, no further formatting.
   */
  label: string;
  /** Width of the bar in CSS pixels at the current camera distance / viewport size. */
  widthPx: number;
};

/**
 * Status reported during engine startup and steady-state.
 *
 * A discriminated union (`kind` field) lets React components switch on the
 * status and render the correct text without carrying extra nullable fields.
 *
 *   initializing  → GPU bootstrap in progress (before fetch starts)
 *   loading       → fetch /data/sdss.bin in progress
 *   ready         → rendering is live; `count` and `source` are set
 *   error         → GPU or fatal load error; `message` carries the detail
 */
export type EngineStatus =
  | { kind: 'initializing' }
  | { kind: 'loading' }
  | { kind: 'ready'; count: number; source: 'sdss.bin' | 'synthetic' }
  | { kind: 'error'; message: string };

/**
 * Callbacks the engine uses to push state changes into the UI layer.
 *
 * All callbacks are called synchronously from the engine's internal code,
 * except where noted. They are called only when the value actually changes,
 * so React's `setState` can be passed in directly.
 *
 * The three optional settings callbacks (`onPointSizeChange`, `onBrightnessChange`,
 * `onAutoRotateChange`) are optional so existing call-sites that don't need
 * settings panel integration continue to typecheck without changes.
 */
export type EngineCallbacks = {
  /** Fired whenever the engine status advances (initializing → loading → ready). */
  onStatusChange: (s: EngineStatus) => void;
  /** Fired when the point under the cursor changes (null = empty sky). */
  onHoverChange: (info: PointInfo | null) => void;
  /** Fired when the pinned/selected point changes. */
  onSelectChange: (info: PointInfo | null) => void;
  /** Fired when the scale bar label or width changes (zoom or resize). */
  onScaleChange: (info: ScaleInfo) => void;

  /**
   * Fired when the point size changes (either from a `setPointSize` call or at
   * engine init so React's initial state matches the engine's default).
   */
  onPointSizeChange?: (sizePx: number) => void;
  /**
   * Fired when the global brightness multiplier changes (either from a
   * `setBrightness` call or at engine init to seed React's initial state).
   */
  onBrightnessChange?: (value: number) => void;
  /**
   * Fired when auto-rotate is toggled (either from `setAutoRotate` or at
   * engine init so React knows the initial off state).
   */
  onAutoRotateChange?: (enabled: boolean) => void;
};

/**
 * Handle returned by `createEngine`. Allows the React layer to drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
  /**
   * Programmatically clear the current selection.
   *
   * No-op when nothing is selected. Fires `onSelectChange(null)` if a point
   * was selected. Used by the Esc key handler in `App.tsx`.
   */
  clearSelection: () => void;

  /**
   * Stop the render loop, release GPU resources, and detach all event listeners.
   *
   * Call this from React's `useEffect` cleanup so that hot-reload and
   * StrictMode double-mounts don't leave orphaned RAF loops or GPU objects.
   */
  destroy: () => void;

  /**
   * Set the billboard pixel radius for all rendered points.
   *
   * Takes effect on the next rendered frame. Also fires `onPointSizeChange`
   * so any subscribed React state stays in sync.
   *
   * @param sizePx  Point size in pixels. Recommended range: 1.0 – 8.0.
   */
  setPointSize: (sizePx: number) => void;

  /**
   * Set the global brightness multiplier applied to every star.
   *
   * A value of 1.0 is the neutral default. Values > 1 brighten the cloud;
   * values < 1 dim it. Also fires `onBrightnessChange`.
   *
   * @param value  Brightness multiplier. Recommended range: 0.2 – 3.0.
   */
  setBrightness: (value: number) => void;

  /**
   * Enable or disable the slow automatic camera yaw.
   *
   * When enabled, the camera yaws at ~3°/second each frame, creating a
   * gentle orbit effect. The user can still drag while auto-rotate is on —
   * both yaw contributions simply add together. Also fires `onAutoRotateChange`.
   *
   * @param enabled  True to start rotating, false to stop.
   */
  setAutoRotate: (enabled: boolean) => void;

  /**
   * Snap the camera back to the initial framing computed at startup.
   *
   * Restores: target = origin, distance = bbox × 2.5, yaw = 0, pitch = 0.3.
   * The reset takes effect on the next rendered frame.
   */
  resetCamera: () => void;
};

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

      renderer.upload(cloud);

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
          const vb = renderer?.vertexBuffer;
          if (!vb || !cloud || !pickRendererHandle) return;

          pickRendererHandle
            .pick(
              [canvas.width, canvas.height],
              cssToTexPx(xCss),
              cssToTexPx(yCss),
              vb,
              cloud.count,
              renderer!.uniformBuffer,
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
        const vb = renderer.vertexBuffer;
        if (
          vb &&
          cloud &&
          latestMouseCss !== null &&
          latestMouseCss !== lastPickedMouseCss &&
          !pickInFlight &&
          !pointerDown // skip hover picks while a drag is in progress
        ) {
          // Snapshot the position at the moment we kick off the pick.
          const pos = latestMouseCss;
          lastPickedMouseCss = pos;
          pickInFlight = true;

          pickRendererHandle!
            .pick(
              [canvas.width, canvas.height],
              cssToTexPx(pos.x),
              cssToTexPx(pos.y),
              vb,
              cloud.count,
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
