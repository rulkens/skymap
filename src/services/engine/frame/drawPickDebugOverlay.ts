/**
 * drawPickDebugOverlay — composite the pick-buffer debug visualisation over
 * the swap chain, AFTER the main frame's `device.queue.submit`.
 *
 * ### What this does
 *
 * When `state.settings.debug.showPickBuffer` is on the developer wants to see
 * the raw pick texture colour-mapped and overlaid on the tone-mapped scene.
 * The overlay:
 *
 *   1. Calls `pickProgram.renderForDebug()` to populate + return the
 *      cosmological slab's pick texture (no readback — the debug path only
 *      writes, it does not copy any texel to a CPU buffer).
 *   2. Opens a NEW command encoder with `loadOp: 'load'` against the swap
 *      chain view so the tone-mapped frame underneath is preserved; the
 *      overlay's premultiplied OVER blend composites on top.
 *   3. Submits that second encoder via `device.queue.submit`.
 *
 * ### Why a separate encoder run POST-frame — a latency choice, not a data dep
 *
 * The overlay runs AFTER `renderFrame`'s submit so the main-frame submit always
 * lands cleanly — the debug overlay is an append-only overlay, never a
 * mid-frame dependency. Its placement is purely a latency choice: it wants to
 * reflect the pose the user is looking at with minimal lag. It carries NO data
 * dependency on the visual frame having drawn — `pickProgram.renderForDebug`
 * rebuilds the pick-time camera as a value (`pickFrameContext`) and re-draws
 * the pickable layers from scratch, so it could in principle run before the
 * main submit too.
 *
 * Folding it into renderFrame's encoder as a second pass would require
 * `renderFrame` to know about the pick texture and the debug overlay renderer,
 * widening its input type for a single dev-only feature. Keeping it external
 * avoids that coupling.
 *
 * ### Sequencing
 *
 * Called from `runFrame` AFTER `renderFrame(...)` returns (which submits
 * the main frame), and BEFORE the render-on-demand tail (so a debug
 * overlay frame does not prevent the loop from sleeping when nothing else
 * is animated).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';

/**
 * Narrow dep bag for the overlay helper — only the GPU handles it actually
 * reads, so the caller does not need to pass the full `RunFrameDeps`.
 */
export type DrawPickDebugOverlayDeps = {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
};

/**
 * Composite the pick-buffer debug visualisation over the swap chain if
 * `state.settings.debug.showPickBuffer` is on and all required handles are
 * non-null.
 *
 * Returns immediately (no-op) when:
 *   - `showPickBuffer` is off
 *   - `pickProgram` or `pickDebugOverlay` is null
 *   - `pickProgram.renderForDebug()` returns null (engine not ready to pick,
 *     or no cosmological pickable layer is enabled)
 *
 * The what-is-pickable and is-the-engine-ready decisions all live inside
 * `pickProgram` now — this helper only asks it for a texture and composites it.
 */
export function drawPickDebugOverlay(state: EngineState, deps: DrawPickDebugOverlayDeps): void {
  if (
    !state.settings.debug.showPickBuffer ||
    state.gpu.pickProgram === null ||
    state.gpu.pickDebugOverlay === null
  ) {
    return;
  }

  const pickTex = state.gpu.pickProgram.renderForDebug();
  if (pickTex === null) return;

  const overlayEncoder = deps.device.createCommandEncoder({
    label: 'pick-debug-overlay-encoder',
  });
  const swapView = deps.context.getCurrentTexture().createView();
  const overlayPass = overlayEncoder.beginRenderPass({
    label: 'pick-debug-overlay-pass',
    colorAttachments: [
      {
        view: swapView,
        // `load` — preserve the tone-mapped frame underneath; the overlay's
        // premultiplied OVER blend composites on top.
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
  });
  state.gpu.pickDebugOverlay.draw(overlayPass, pickTex.createView());
  overlayPass.end();
  deps.device.queue.submit([overlayEncoder.finish()]);
}
