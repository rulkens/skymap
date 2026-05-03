/**
 * Application entry point — wires all subsystems into a live render loop.
 *
 * Responsibility: build the GPU pipeline, populate it with a synthetic galaxy
 * cloud, set up an orbit camera, and drive the per-frame update cycle.
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
 *   4. **renderer.draw** — uploads the per-frame uniforms (viewProj, viewport)
 *      and issues the single instanced draw call: 6 vertices × 100 k instances.
 *      The WGSL vertex shader expands each instance into a billboard quad.
 *
 *   5. **Submit** — `encoder.finish()` seals the command buffer;
 *      `device.queue.submit([...])` dispatches it to the GPU asynchronously.
 *      The JS thread is free immediately after.
 *
 * Because this file has `import` statements at the top, TypeScript (and the
 * browser) already treat it as an ES module — no `export {}` shim is needed to
 * prevent `window` namespace pollution.
 */

import { initGpu, resizeCanvasToDisplay } from './gpu/device';
import { PointRenderer } from './gpu/pointRenderer';
import { createOrbitCamera, computeViewProj, updatePosition } from './camera/orbitCamera';
import { attachOrbitControls } from './camera/orbitControls';
import { generateSyntheticCloud } from './data/synthetic';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

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

  // Wire pointer and wheel events so the user can orbit and zoom.
  attachOrbitControls(canvas, cam);

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
    // We switched from the earlier dark-navy clear because the point renderer
    // uses *additive* blending: each fragment's RGB is added to whatever is
    // already in the framebuffer. Starting from pure black (0, 0, 0) gives the
    // maximum dynamic range — even faint points contribute visible light, and
    // dense overlap regions (galaxy clusters) naturally bloom bright. Any
    // non-zero clear value would raise the noise floor and make sparse regions
    // look grey rather than dark.
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

    // Upload per-frame uniforms (viewProj, viewport) and issue the instanced
    // draw call. Physical pixel dimensions are passed so the shader can convert
    // the fixed point-size-in-pixels to clip-space offsets correctly.
    renderer.draw(pass, vp, [canvas.width, canvas.height]);

    pass.end();

    // Seal the command buffer and send it to the GPU.
    device.queue.submit([encoder.finish()]);

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
