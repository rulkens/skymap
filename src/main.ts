/**
 * Application entry point — wires all subsystems into a live render loop.
 *
 * Responsibility: build the GPU pipeline, populate it with a real or synthetic
 * galaxy cloud, set up an orbit camera, and drive the per-frame update cycle.
 * Also owns all hover/select UX: throttled GPU picking, the info card DOM, and
 * click-to-pin / Esc-to-clear selection behaviour.
 *
 * ### Data loading strategy
 *
 * On startup we attempt to fetch `/data/sdss.bin` — a binary PointCloud file
 * produced by `tools/csvToBin.ts` from a real SDSS galaxy export. If the fetch
 * succeeds we decode it with `decodePointCloud`; if it fails (file missing,
 * HTTP error, network timeout) we fall back to a 100k synthetic cloud so the
 * app remains usable without the data file. The status bar reflects which
 * source is active.
 *
 * ### Frame structure (camera → encoder → pass → renderer.draw → submit)
 *
 *   1. **Camera update** — if the canvas was resized, `cam.aspect` is patched
 *      and `updatePosition` is called to keep the view-projection matrix
 *      consistent with the new viewport shape. Otherwise this step is free
 *      (just two integer comparisons inside `resizeCanvasToDisplay`).
 *
 *   2. **Encoder** — `device.createCommandEncoder()` opens a command recorder.
 *      No GPU work starts yet; we are building a description of what to run.
 *
 *   3. **Render pass** — `encoder.beginRenderPass(...)` starts a block of draw
 *      calls targeting the current swap-chain texture. `loadOp: 'clear'` wipes
 *      the attachment to `clearValue` before any drawing; `storeOp: 'store'`
 *      writes the result back to the texture so it appears on screen.
 *
 *   4. **renderer.draw** — uploads the per-frame uniforms (viewProj, viewport,
 *      selectedIndex) and issues the single instanced draw call: 6 vertices ×
 *      N instances. The WGSL vertex shader expands each instance into a
 *      billboard quad; the selected point gets a 3× larger ring/halo.
 *
 *   5. **Submit** — `encoder.finish()` seals the command buffer;
 *      `device.queue.submit([...])` dispatches it to the GPU asynchronously.
 *      The JS thread is free immediately after.
 *
 *   6. **Hover pick** — once per frame, if the mouse has moved since the last
 *      pick and no pick is already in flight, we fire a `pickRenderer.pick()`
 *      call as a fire-and-forget promise. When it resolves it updates
 *      `hoveredIndex` and refreshes the card. We do NOT await it inside the
 *      render loop — awaiting would block the frame.
 *
 * Because this file has `import` statements at the top, TypeScript (and the
 * browser) already treat it as an ES module — no `export {}` shim is needed to
 * prevent `window` namespace pollution.
 */

import { initGpu, resizeCanvasToDisplay } from './gpu/device';
import { PointRenderer } from './gpu/pointRenderer';
import { createPickRenderer } from './gpu/pickRenderer';
import { createOrbitCamera, computeViewProj, updatePosition } from './camera/orbitCamera';
import { attachOrbitControls } from './camera/orbitControls';
import { generateSyntheticCloud } from './data/synthetic';
import { decodePointCloud } from './data/pointCloudFormat';
import { cartesianToRaDecZ } from './data/coords';
import type { PointCloud } from './types';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

// ── Cloud helpers ──────────────────────────────────────────────────────────────

/**
 * Return the maximum absolute value of any coordinate component in the cloud's
 * positions array.
 *
 * We use *max abs of any component* rather than computing a true bounding
 * radius (which would require a sqrt per point). For camera-distance purposes
 * this is a heuristic anyway — slightly over-estimating is harmless — and
 * avoiding sqrt keeps this O(N) scan as cheap as possible.
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
  const mantissa = x / power;          // ∈ [1, 10)
  const niceMantissa =
    mantissa >= 5 ? 5 :
    mantissa >= 2 ? 2 :
    1;
  return niceMantissa * power;
}

/**
 * Format a distance in Mpc, switching units up/down for readability:
 *   < 1 Mpc       → kpc (kiloparsec)
 *   < 1000 Mpc    → Mpc (megaparsec)  — most SDSS galaxies fall here
 *   ≥ 1000 Mpc    → Gpc (gigaparsec)  — high-z quasars
 *
 * The number is rendered with toLocaleString for thousands separators so big
 * values like "2,000 Mpc" stay readable.
 */
function formatDistance(mpc: number): string {
  if (mpc < 1)    return `${(mpc * 1000).toLocaleString()} kpc`;
  if (mpc >= 1000) return `${(mpc / 1000).toLocaleString()} Gpc`;
  return `${mpc.toLocaleString()} Mpc`;
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
 *
 * The static import of `decodePointCloud` is intentional — Vite tree-shakes
 * correctly without dynamic import, and a static import is simpler and loads
 * faster (no extra chunk round-trip).
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

// ── Info card DOM refs ─────────────────────────────────────────────────────────
//
// We grab all the card elements once at startup and update them by direct
// `textContent` assignment — faster and safer than innerHTML, and avoids any
// XSS risk from the formatted number strings.
const infoCard       = document.getElementById('info-card')!;
const fieldIndex     = document.getElementById('field-index')!;
const fieldRa        = document.getElementById('field-ra')!;
const fieldDec       = document.getElementById('field-dec')!;
const fieldZ         = document.getElementById('field-z')!;
const fieldDistance  = document.getElementById('field-distance')!;
const fieldMagnitude = document.getElementById('field-magnitude')!;
const fieldColor     = document.getElementById('field-color')!;

// ── Scale-bar DOM refs ─────────────────────────────────────────────────────────
const scaleLabel = document.getElementById('scale-label')!;
const scaleLine  = document.getElementById('scale-line')!;

async function main() {
  // Size the backing store to match the display before handing the canvas to
  // WebGPU. Without this, `getCurrentTexture()` might return a 300×150 default
  // texture regardless of how large the element is on screen.
  resizeCanvasToDisplay(canvas);

  const { device, context, format } = await initGpu(canvas);

  // Build the GPU pipeline; cloud data is loaded below.
  const renderer = new PointRenderer(device, format);

  // Signal loading state immediately so the user knows something is happening
  // before the (potentially multi-second) fetch completes.
  status.textContent = 'loading SDSS data…';

  // Fetch /data/sdss.bin; fall back to synthetic on any error.
  const { cloud, source } = await loadCloud();
  renderer.upload(cloud);

  // Build the pick renderer. It shares the same vertex/uniform buffers as the
  // visual renderer — no extra GPU memory for point data.
  const pickRenderer = createPickRenderer(device);

  // ── Camera auto-framing ──────────────────────────────────────────────────────
  //
  // Rather than hardcoding `distance: 2500` (which was tuned for the synthetic
  // 1000 Mpc-radius sphere), we measure the actual spatial extent of the loaded
  // cloud. Real SDSS galaxies mostly live at z ≈ 0.1–0.7 → ~430–3000 Mpc, so
  // the bounding box varies depending on the sample.
  //
  // `bbox` = max abs of any coordinate component (cheap; no sqrt).
  // `distance` = bbox × 2.5 — 2.5× the half-extent frames the cloud with a
  //   comfortable margin similar to the old synthetic framing.
  // `far`      = bbox × 4 — ensures the most distant points aren't clipped.
  //
  // `pitch: 0.3` rad (~17°) — a slight downward tilt so we don't view the cloud
  // edge-on at the equator. Even a shallow pitch reveals the full 3-D extent.
  const bbox = maxAbsCoord(cloud);
  const camDistance = bbox * 2.5;
  const camFar = bbox * 4;

  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance: camDistance,
    yaw: 0,
    pitch: 0.3,
    fovYRad: (Math.PI / 180) * 60,
    aspect: canvas.width / canvas.height,
    near: 1,
    far: camFar,
  });

  // ── Hover / selection state ────────────────────────────────────────────────
  //
  // We track three kinds of state:
  //
  //   latestMouseCss      — the most recent pointer position in CSS pixels,
  //                         updated on every pointermove. `null` when the
  //                         pointer is outside the canvas.
  //
  //   lastPickedMouseCss  — the position we issued the last pick for. We compare
  //                         this to latestMouseCss to decide if a new pick is
  //                         needed. Updated when a pick is kicked off.
  //
  //   pickInFlight        — true while a pick promise is outstanding. Guards
  //                         against launching a second concurrent pick (which
  //                         would cause a mapAsync conflict).
  //
  //   hoveredIndex        — the 0-based index of the point currently under the
  //                         cursor, or null if the cursor is over empty space.
  //                         Updated when a pick resolves.
  //
  //   selectedIndex       — the 0-based index of the "pinned" point, or null if
  //                         nothing is selected. Set by click; cleared by
  //                         clicking empty space or pressing Esc.
  //
  // State is stored as closure variables (not a class) to keep the code flat.

  type MousePos = { x: number; y: number };

  let latestMouseCss:     MousePos | null = null;
  let lastPickedMouseCss: MousePos | null = null;
  let pickInFlight = false;
  let hoveredIndex:  number | null = null;
  let selectedIndex: number | null = null;

  // True while a pointer (mouse button / finger / pen tip) is pressed on the
  // canvas. The orbit-controls module already tracks its own drag flag for
  // camera math, but it doesn't expose it. We mirror the bit here so the
  // hover-pick scheduler can suppress picks during a drag — otherwise the
  // info card would flicker through every point the cursor passes over while
  // the user is rotating the camera.
  let pointerDown = false;

  // ── GPU pick helper ────────────────────────────────────────────────────────
  //
  // DPR cap matches `resizeCanvasToDisplay` in device.ts (≤ 2). We precompute
  // it here and reuse it in both the hover pick and the click pick paths.
  // If the DPR changes (unusual) the next pick will use the stale cap; this
  // is acceptable — a refresh resolves it.

  /**
   * Convert a CSS pixel coordinate to a texture-space pixel coordinate.
   *
   * `resizeCanvasToDisplay` caps DPR at 2 to avoid allocating enormous textures
   * on 3× or 4× HiDPI screens. We mirror that cap here so our pick coordinates
   * land in the correct texel.
   */
  function cssToTexPx(cssPx: number): number {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return cssPx * dpr;
  }

  // ── Info card DOM update ───────────────────────────────────────────────────

  /**
   * Populate and show (or hide) the info card based on current hover/selection.
   *
   * Display rule:
   *   - If a point is hovered → show that point's data (live hover, not pinned).
   *   - Else if a point is selected → show that point's data with PINNED badge.
   *   - Else → hide the card.
   *
   * Data is read from `cloud` (closure scope) and `cartesianToRaDecZ` is used
   * to recover RA/Dec/redshift from the stored Cartesian positions.
   */
  function refreshCard(): void {
    // Hover wins over selection for display; isPinned is true only when we fall
    // back to the selected point with no active hover.
    const idx = hoveredIndex ?? selectedIndex;
    if (idx === null) {
      infoCard.style.display = 'none';
      infoCard.removeAttribute('data-pinned');
      return;
    }

    const isPinned = hoveredIndex === null && selectedIndex !== null;

    // Show the card and toggle the PINNED badge via a data attribute.
    // CSS rule `#info-card[data-pinned] #pinned-badge { display: inline; }`
    // handles the visual toggling — no extra inline style manipulation needed.
    infoCard.style.display = 'block';
    if (isPinned) {
      infoCard.setAttribute('data-pinned', '');
    } else {
      infoCard.removeAttribute('data-pinned');
    }

    // Read position from the SoA positions array (layout: [x0,y0,z0, x1,y1,z1, …]).
    const px = cloud.positions[idx * 3 + 0]!;
    const py = cloud.positions[idx * 3 + 1]!;
    const pz = cloud.positions[idx * 3 + 2]!;

    // Recover sky coordinates from the Cartesian position.
    // cartesianToRaDecZ returns [raDeg, decDeg, zRedshift].
    const [raDeg, decDeg, zRedshift] = cartesianToRaDecZ(px, py, pz);

    // Distance in Mpc = sqrt(x²+y²+z²). We already have the components.
    const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

    // Populate each field. `toFixed` gives consistent decimal places:
    //   RA / Dec: 4 dp (e.g. "123.4567°")
    //   Redshift: 4 dp (e.g. "0.1234")
    //   Distance: 1 dp  (e.g. "542.3 Mpc") — Mpc precision doesn't need more
    //   Magnitude / colorIndex: 2 and 3 dp respectively
    fieldIndex.textContent     = String(idx);
    fieldRa.textContent        = raDeg.toFixed(4);
    fieldDec.textContent       = decDeg.toFixed(4);
    fieldZ.textContent         = zRedshift.toFixed(4);
    fieldDistance.textContent  = distanceMpc.toFixed(1);
    fieldMagnitude.textContent = cloud.magnitudes[idx]!.toFixed(2);
    fieldColor.textContent     = cloud.colorIndex[idx]!.toFixed(3);
  }

  // ── Pointer event listeners ────────────────────────────────────────────────

  // Track latest mouse position for the per-frame throttled hover pick.
  canvas.addEventListener('pointermove', (e) => {
    latestMouseCss = { x: e.clientX, y: e.clientY };
  });

  // When the pointer leaves the canvas, clear hover state and update the card.
  // If a point is selected the card will remain visible (showing the pinned point).
  canvas.addEventListener('pointerleave', () => {
    latestMouseCss = null;
    hoveredIndex = null;
    refreshCard();
  });

  // ── Drag detection (suppress hover picks during camera rotation) ───────────
  //
  // We listen on `window` (not the canvas) for pointerup so we still see the
  // release even when `setPointerCapture` has routed events back to the canvas
  // via the orbit-controls module. The capture means the canvas receives
  // pointerup, but `window` sees it too via bubbling.
  //
  // On pointerdown we also clear the current hover so the card immediately
  // reflects "nothing hovered" instead of lagging until the drag ends.
  canvas.addEventListener('pointerdown', () => {
    pointerDown = true;
    if (hoveredIndex !== null) {
      hoveredIndex = null;
      refreshCard();
    }
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });
  // Defensive: if the OS cancels the gesture (e.g. context-menu interrupt),
  // we still want to release the suppression flag.
  window.addEventListener('pointercancel', () => {
    pointerDown = false;
  });

  // ── Click handling ─────────────────────────────────────────────────────────
  //
  // Click detection is delegated to `attachOrbitControls` via the `onClick`
  // option. A "click" fires only when pointerup is within 4 CSS pixels of
  // pointerdown — pure drags (orbit gestures) are suppressed.

  attachOrbitControls(canvas, cam, {
    onClick: (xCss, yCss) => {
      // Run a one-shot pick at the click position.
      // We don't use the throttle guard here — clicks are infrequent and
      // we want an immediate, synchronous-feeling response.
      const vb = renderer.vertexBuffer;
      if (!vb) return; // no data uploaded yet

      pickRenderer
        .pick(
          [canvas.width, canvas.height],
          cssToTexPx(xCss),
          cssToTexPx(yCss),
          vb,
          cloud.count,
          renderer.uniformBuffer,
        )
        .then((idx) => {
          if (idx === -1) {
            // Click on empty space → clear selection.
            selectedIndex = null;
          } else {
            // Click on a point → pin it.
            selectedIndex = idx;
          }
          refreshCard();
        });
    },
  });

  // ── Esc → clear selection ──────────────────────────────────────────────────

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectedIndex = null;
      refreshCard();
    }
  });

  // ── Status bar ─────────────────────────────────────────────────────────────
  //
  // The label reflects the actual data source so the user can immediately tell
  // whether real SDSS galaxies or the synthetic fallback are being rendered.

  const sourceLabel =
    source === 'sdss.bin'
      ? 'sdss.bin'
      : 'synthetic — sdss.bin not found';

  status.textContent =
    `WebGPU OK · ${cloud.count.toLocaleString()} points (${sourceLabel}) · drag to orbit, wheel to zoom`;

  // ── Scale-bar update ────────────────────────────────────────────────────────
  //
  // Compute "pixels-per-Mpc at the camera target" and pick a nice round Mpc
  // value (1 / 2 / 5 × 10^k) such that the bar spans roughly 150 px.
  //
  // Math: with a perspective camera, the visible *vertical* world height at a
  // distance `d` from the camera is  2·d·tan(fovY/2). One world unit therefore
  // takes up  viewportHeightPx / (2·d·tan(fovY/2))  pixels at distance d.
  // We measure at the focal point (camera target) — close enough for a heuristic
  // legend, and matches what the user perceives at the centre of the screen.
  //
  // We don't need to recompute on every frame, but it's cheap (a handful of
  // multiplies + 3 DOM writes) and keeping it in the render loop guarantees the
  // bar stays in sync with zoom/resize without extra wiring.
  const SCALE_TARGET_PX = 150;
  let lastScaleSig = '';

  function updateScaleBar(): void {
    // Use CSS pixels (clientHeight), not the backing-store size, so the bar's
    // physical width on screen matches the legend reading regardless of DPR.
    const viewportCssHeight = canvas.clientHeight;
    if (viewportCssHeight === 0) return;

    const pxPerMpc = viewportCssHeight / (2 * cam.distance * Math.tan(cam.fovYRad / 2));
    if (!isFinite(pxPerMpc) || pxPerMpc <= 0) return;

    const desiredMpc = SCALE_TARGET_PX / pxPerMpc;
    const niceMpc    = niceRound(desiredMpc);
    const widthPx    = niceMpc * pxPerMpc;

    // Avoid redundant DOM writes when nothing changed (zoom unchanged etc).
    const sig = `${niceMpc}:${widthPx.toFixed(0)}`;
    if (sig === lastScaleSig) return;
    lastScaleSig = sig;

    scaleLine.style.width = `${widthPx.toFixed(0)}px`;
    scaleLabel.textContent = formatDistance(niceMpc);
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  function frame() {
    // Resize the swap-chain if the canvas element changed size (e.g. the user
    // resized the browser window). `resizeCanvasToDisplay` returns `true` only
    // when the pixel dimensions actually changed, so we patch `cam.aspect` and
    // call `updatePosition` only in that branch — avoiding a redundant matrix
    // recompute on the 99 % of frames where nothing changed.
    if (resizeCanvasToDisplay(canvas)) {
      cam.aspect = canvas.width / canvas.height;
      updatePosition(cam);
    }

    // Refresh the scale-bar legend. The function early-returns when nothing
    // changed, so this costs ~zero on frames where zoom and viewport are stable.
    updateScaleBar();

    // Snapshot the current camera state into a combined view-projection matrix.
    // This read happens *after* any input-driven mutations applied by the orbit
    // controls on the previous event tick, so the matrix is always up to date.
    const vp = computeViewProj(cam);

    // ── Command recording ─────────────────────────────────────────────────────

    const encoder = device.createCommandEncoder();

    // Clear colour is pure black (r:0, g:0, b:0).
    //
    // We use *additive* blending: each fragment's RGB is added to whatever is
    // already in the framebuffer. Starting from pure black (0, 0, 0) gives the
    // maximum dynamic range — even faint points contribute visible light, and
    // dense overlap regions (galaxy clusters) naturally bloom bright.
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',   // wipe to clearValue at pass start
          storeOp: 'store',  // write results to the swap-chain texture
        },
      ],
    });

    // Upload per-frame uniforms (viewProj, viewport, selectedIndex) and issue
    // the instanced draw call. Physical pixel dimensions are passed so the
    // shader can convert the fixed point-size-in-pixels to clip-space offsets.
    //
    // selectedIndex drives the WGSL selection highlight: the shader enlarges
    // that billboard and renders it as a hollow ring. `0xffffffff >>> 0` is the
    // sentinel for "nothing selected" — the max u32 value, which can never
    // match a real point index.
    renderer.draw(pass, vp, [canvas.width, canvas.height], 2.5, 1.0,
      selectedIndex !== null ? selectedIndex : 0xffffffff >>> 0);

    pass.end();

    // Seal the command buffer and send it to the GPU.
    device.queue.submit([encoder.finish()]);

    // ── Throttled hover pick ──────────────────────────────────────────────────
    //
    // Strategy: pointermove updates `latestMouseCss`; here (once per frame) we
    // check whether the mouse has moved since the last pick. If it has AND no
    // pick is already in flight, we kick off a new one.
    //
    // We compare object references rather than coordinates — a new position
    // object was created by the pointermove handler, so reference inequality
    // means the mouse actually moved. When `latestMouseCss === lastPickedMouseCss`
    // the mouse hasn't moved; no pick needed.
    //
    // The pick is fire-and-forget: we do NOT await it here. Awaiting inside
    // requestAnimationFrame would block the frame loop. Instead the `.then`
    // callback updates state when the GPU readback completes (typically 1-2
    // frames later) and the next frame's card refresh shows the new data.
    //
    // IMPORTANT: pick() is called *after* device.queue.submit([encoder.finish()])
    // above, so the visual frame's uniform buffer has already been written with
    // the latest viewProj. The pick renderer reads the same uniform buffer and
    // therefore sees the correct camera state for this frame.
    const vb = renderer.vertexBuffer;
    if (
      vb &&
      latestMouseCss !== null &&
      latestMouseCss !== lastPickedMouseCss &&
      !pickInFlight &&
      !pointerDown    // ← skip hover picks while a drag is in progress
    ) {
      // Snapshot the position at the moment we kick off the pick.
      // By the time the promise resolves, latestMouseCss may have moved on —
      // but the pick result is still valid for the position we captured here.
      const pos = latestMouseCss;
      lastPickedMouseCss = pos;
      pickInFlight = true;

      pickRenderer
        .pick(
          [canvas.width, canvas.height],
          cssToTexPx(pos.x),
          cssToTexPx(pos.y),
          vb,
          cloud.count,
          renderer.uniformBuffer,
        )
        .then((idx) => {
          hoveredIndex = idx === -1 ? null : idx;
          refreshCard();
        })
        .finally(() => {
          pickInFlight = false;
        });
    }

    // Schedule the next frame. `requestAnimationFrame` syncs to the display
    // refresh rate (typically 60 or 120 Hz) and pauses automatically when the
    // tab is hidden, saving battery and GPU time.
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  // Surface initialisation failures in the status bar so the user sees a
  // readable message rather than a blank canvas with no explanation.
  status.textContent = `ERROR: ${err.message}`;
  console.error(err);
});
