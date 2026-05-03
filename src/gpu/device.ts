/**
 * WebGPU device initialisation.
 *
 * Before any drawing can happen, WebGPU requires a three-step bootstrap:
 *
 *   1. **Adapter** — represents a physical (or software-fallback) GPU. You
 *      request one from `navigator.gpu`; the browser picks the best match for
 *      your hints and hardware. Think of it as a description of what the GPU
 *      *can* do, not a live channel to it.
 *
 *   2. **Device** — a logical, sandboxed connection to the adapter. This is
 *      the object you use for everything: creating buffers, pipelines, command
 *      encoders, etc. One tab == one device (typically). Requesting the device
 *      also gives you a `device.queue`, the single ordered channel for
 *      submitting work to the GPU.
 *
 *   3. **Canvas context** — a `GPUCanvasContext` that bridges the WebGPU
 *      swap-chain to the HTML `<canvas>`. After `context.configure()`, each
 *      call to `context.getCurrentTexture()` hands you the next frame's
 *      render target.
 *
 * Keeping this bootstrap in one place lets the rest of the app (camera,
 * renderer, UI) receive a fully-initialised `GpuContext` without caring about
 * the order of async operations or browser-detection boilerplate.
 */

import type { GpuContext } from '../@types';

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Bootstrap WebGPU: adapter → device → context → configure.
 *
 * This is `async` because adapter and device acquisition both involve IPC
 * with the browser's GPU process. Typical latency is a few milliseconds on
 * first load, negligible thereafter.
 *
 * ### Why not cache the adapter?
 *
 * The adapter can be invalidated if the user unplugs an eGPU or the driver
 * crashes. For simplicity we request fresh on each call — this function is
 * called once at startup anyway.
 *
 * @param canvas  The `<canvas>` element to render into. It must be in the DOM
 *                before this function is called so that `getContext('webgpu')`
 *                succeeds.
 * @throws If WebGPU is unavailable, no adapter is found, or the canvas context
 *         cannot be created. The caller should display a user-facing error.
 */
export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  // `navigator.gpu` is undefined in browsers that don't implement WebGPU
  // (Firefox stable, some mobile browsers as of 2024). Checking it first gives
  // a clear error rather than a confusing `TypeError: Cannot read properties
  // of undefined` on the next line.
  if (!navigator.gpu) throw new Error('WebGPU not supported in this browser.');

  // Step 1 — Request an adapter.
  // `requestAdapter()` returns null when the browser has no usable GPU
  // (e.g. headless test environments, or a machine whose GPU is blocked by
  // a corporate driver policy). We treat that as a hard stop.
  // See: https://www.w3.org/TR/webgpu/#dom-gpu-requestadapter
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter available.');

  // Step 2 — Request a device.
  // The device is the primary WebGPU object. We request with no descriptor,
  // getting the adapter's default feature set and limits. Later tasks will
  // request specific features (e.g. `timestamp-query`) here.
  // See: https://www.w3.org/TR/webgpu/#dom-gpuadapter-requestdevice
  const device = await adapter.requestDevice();

  // Step 3 — Get the canvas context.
  // `getContext('webgpu')` returns null if the canvas already has a different
  // context type (e.g. '2d'). In practice this only happens if the same
  // canvas is used elsewhere — still worth guarding.
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('Could not get webgpu context.');

  // Choose the swap-chain format the browser prefers for *this* display.
  // On most systems this is either `'bgra8unorm'` (macOS/Windows) or
  // `'rgba8unorm'` (Linux/Android). Hardcoding one or the other silently
  // corrupts colours on the other platform — always use this call.
  // See: https://www.w3.org/TR/webgpu/#dom-gpu-getpreferredcanvasformat
  const format = navigator.gpu.getPreferredCanvasFormat();

  // Configure the swap-chain.
  //
  // `alphaMode: 'premultiplied'` means the texture values we write are
  // *already* multiplied by their alpha — i.e. a 50%-transparent white
  // pixel is stored as (0.5, 0.5, 0.5, 0.5) rather than (1, 1, 1, 0.5).
  //
  // Why does this matter for stars? When we render additive point sprites
  // (glowing star halos that should *add* brightness, not occlude each
  // other), the blend equation we'll use is:
  //
  //     dst = src.rgb + dst.rgb * (1 − src.a)
  //
  // Premultiplied alpha is the prerequisite for that equation to composite
  // correctly against both the web page background and other transparent
  // layers. The alternative `'opaque'` would be fine for a fully opaque
  // sky, but `'premultiplied'` keeps options open for the point renderer.
  //
  // See: https://www.w3.org/TR/webgpu/#dom-gpucanvasalphamode-premultiplied
  context.configure({ device, format, alphaMode: 'premultiplied' });

  return { device, context, format, canvas };
}

// ─── Resize helper ────────────────────────────────────────────────────────────

/**
 * Sync the canvas's *backing-store* pixel dimensions to its *CSS display* size.
 *
 * ### CSS pixels vs. backing-store pixels
 *
 * A `<canvas>` has two independent sizes:
 *
 *   - **CSS size** (`canvas.clientWidth` / `canvas.clientHeight`) — how big
 *     the element appears in the layout. On a 1× monitor, 1 CSS pixel = 1
 *     physical pixel. On a Retina/HiDPI display, 1 CSS pixel may be 2 or 3
 *     physical pixels.
 *
 *   - **Backing-store size** (`canvas.width` / `canvas.height`) — how many
 *     texels the canvas actually has. This is what WebGPU renders into. If
 *     the backing store is smaller than the display size, the browser upscales
 *     the result, producing a blurry image. If it is larger, the GPU does
 *     unnecessary work.
 *
 * We multiply by `devicePixelRatio` to match the physical display resolution.
 *
 * ### Why cap DPR at 2?
 *
 * Some iOS and Android devices report a DPR of 3 or even 4. A 3× device at
 * 1080p CSS width would need a 3240px backing store — 9× the area of a 1×
 * canvas. For a star-map the visual difference between 2× and 3× is negligible
 * (stars are tiny bright dots, not fine text), while the GPU memory and
 * fill-rate cost is substantial. Capping at 2 is a deliberate fidelity/
 * performance tradeoff.
 *
 * @param canvas  The canvas to resize. Mutates `canvas.width`/`canvas.height`.
 * @returns `true` if the dimensions changed (caller should re-submit draw
 *          state that depends on viewport size, e.g. the projection matrix),
 *          `false` if the canvas was already the right size.
 */
export function resizeCanvasToDisplay(canvas: HTMLCanvasElement): boolean {
  // Clamp DPR to 2 — see doc-comment above for rationale.
  // `|| 1` guards the rare case where `devicePixelRatio` is 0 or NaN
  // (seen in some jsdom test environments).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // `Math.floor` ensures we never request a sub-pixel fraction from the GPU.
  // `Math.max(1, …)` prevents a zero-dimension canvas when the element is
  // hidden (`clientWidth === 0`), which would cause WebGPU validation errors.
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));

  // Only resize when necessary. Writing `canvas.width` always invalidates
  // the swap-chain (triggering an implicit `context.configure()` re-run in
  // some browsers) and discards the current frame — avoid it when nothing
  // changed.
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}
