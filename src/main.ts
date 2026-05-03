/**
 * Application entry point — wires all subsystems into a live render loop.
 *
 * Responsibility: build the GPU pipeline, populate it with a synthetic galaxy
 * cloud, set up an orbit camera, and drive the per-frame update cycle. Also
 * owns all hover/select UX: throttled GPU picking, the info card DOM, and
 * click-to-pin / Esc-to-clear selection behaviour.
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
 *      100 k instances. The WGSL vertex shader expands each instance into a
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
import { cartesianToRaDecZ } from './data/coords';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

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

async function main() {
  // Size the backing store to match the display before handing the canvas to
  // WebGPU. Without this, `getCurrentTexture()` might return a 300×150 default
  // texture regardless of how large the element is on screen.
  resizeCanvasToDisplay(canvas);

  const { device, context, format } = await initGpu(canvas);

  // Build the GPU pipeline and generate 100 k fictitious galaxy positions.
  const renderer = new PointRenderer(device, format);
  const cloud = generateSyntheticCloud(100_000);
  renderer.upload(cloud);

  // Build the pick renderer. It shares the same vertex/uniform buffers as the
  // visual renderer — no extra GPU memory for point data.
  const pickRenderer = createPickRenderer(device);

  // ── Camera setup ────────────────────────────────────────────────────────────
  //
  // `distance: 2500` Mpc — the synthetic sphere has radius 1000 Mpc, so placing
  // the camera at 2.5 × the sphere radius gives a comfortable framing: the
  // entire cloud is visible with a little breathing room on all sides.
  //
  // `pitch: 0.3` rad (~17°) — a slight downward tilt so we don't view the cloud
  // edge-on at the equator. Even a shallow pitch reveals the full spherical
  // extent and makes the cloud look more three-dimensional.
  const cam = createOrbitCamera({
    target: [0, 0, 0],
    distance: 2500,
    yaw: 0,
    pitch: 0.3,
    fovYRad: (Math.PI / 180) * 60,
    aspect: canvas.width / canvas.height,
    near: 1,
    far: 20000,
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

  status.textContent =
    `WebGPU OK · ${cloud.count.toLocaleString()} synthetic points · drag to orbit, wheel to zoom`;

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
