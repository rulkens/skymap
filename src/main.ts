/**
 * Application entry point.
 *
 * This module bootstraps WebGPU and drives the render loop. Its only job
 * right now is to clear the canvas to a dark-navy colour every frame —
 * the visual equivalent of "hello, WebGPU". Subsequent tasks will add a
 * camera, a point renderer, and real SDSS data.
 *
 * ### Frame structure
 *
 * Every WebGPU frame follows the same three-step pattern:
 *
 *   1. **Encoder** — `device.createCommandEncoder()` creates an object that
 *      records GPU commands into a command buffer. No work runs yet; we are
 *      just describing what we want the GPU to do.
 *
 *   2. **Render pass** — `encoder.beginRenderPass(...)` opens a block of
 *      draw calls that target one or more textures (colour attachments, depth,
 *      etc.). The pass descriptor declares what to do at the *start* (`loadOp`)
 *      and *end* (`storeOp`) of the pass:
 *
 *        - `loadOp: 'clear'`  — fill the attachment with `clearValue` before
 *          any draw calls. The alternative, `'load'`, keeps whatever was in
 *          the texture from the previous frame — useful for multi-pass effects,
 *          but we always want a clean slate here.
 *
 *        - `storeOp: 'store'` — write the pass results back to the texture
 *          after the pass ends. The alternative, `'discard'`, throws the
 *          results away (handy for intermediate depth buffers that only exist
 *          to drive early-Z rejection, not to be displayed).
 *
 *   3. **Submit** — `encoder.finish()` seals the command buffer;
 *      `device.queue.submit([...])` sends it to the GPU for execution.
 *      The GPU executes asynchronously; the JS thread is free immediately.
 *
 * Because this file has `import` statements at the top, TypeScript (and the
 * browser) already treat it as an ES module — no `export {}` shim is needed
 * to prevent `window` namespace pollution.
 */

import { initGpu, resizeCanvasToDisplay } from './gpu/device';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('status')!;

async function main() {
  // Size the backing store to match the display before we hand the canvas to
  // WebGPU. If we skip this, `getCurrentTexture()` might return a 300×150
  // default-sized texture (the HTML canvas default) regardless of how large
  // the element is on screen.
  resizeCanvasToDisplay(canvas);

  const { device, context, format } = await initGpu(canvas);

  // Show the detected swap-chain format so it's easy to confirm during
  // development that the browser chose what we expect.
  status.textContent = `WebGPU OK · ${format}`;

  function frame() {
    // Resize every frame so the swap-chain tracks browser window resize
    // events and CSS layout changes (e.g. the user drags the window wider).
    // `resizeCanvasToDisplay` is cheap when nothing changed (just two integer
    // comparisons), so calling it unconditionally is fine.
    resizeCanvasToDisplay(canvas);

    // Step 1 — Open a command encoder.
    const encoder = device.createCommandEncoder();

    // Step 2 — Begin a render pass that clears to dark navy.
    //
    // `context.getCurrentTexture()` returns the next available swap-chain
    // texture. Calling `.createView()` on it gives us a `GPUTextureView`,
    // which is what the render-pass descriptor actually references.
    //
    // The clear colour (r:0.02, g:0.02, b:0.05, a:1.0) is a near-black navy
    // that reads as "outer space" without being pure black, which helps
    // faint points pop visually.
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
          loadOp: 'clear',   // wipe to clearValue at pass start
          storeOp: 'store',  // write results to the swap-chain texture
        },
      ],
    });

    // No draw calls yet — this is just the clear pass. Future tasks will
    // call `pass.setPipeline(...)` and `pass.draw(...)` here.
    pass.end();

    // Step 3 — Seal the buffer and dispatch it to the GPU.
    device.queue.submit([encoder.finish()]);

    // Schedule the next frame. `requestAnimationFrame` syncs to the display
    // refresh rate (typically 60 or 120 Hz) and pauses automatically when
    // the tab is hidden, saving battery and GPU time.
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((err: Error) => {
  // Surface initialisation failures in the status bar so the user sees a
  // readable message rather than a blank canvas with no explanation.
  status.textContent = `ERROR: ${err.message}`;
  console.error(err);
});
