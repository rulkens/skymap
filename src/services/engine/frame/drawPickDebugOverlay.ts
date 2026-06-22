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
 *   1. Calls `pickRenderer.renderForDebug(...)` to populate the pick texture
 *      (no readback — the debug renderer only writes, it does not copy to a
 *      CPU buffer).
 *   2. Opens a NEW command encoder with `loadOp: 'load'` against the swap
 *      chain view so the tone-mapped frame underneath is preserved; the
 *      overlay's premultiplied OVER blend composites on top.
 *   3. Submits that second encoder via `device.queue.submit`.
 *
 * ### Why a separate encoder (not folded into renderFrame's encoder)
 *
 * The debug pass must run AFTER `renderFrame`'s submit because the pick
 * renderer needs the visual frame's packed uniform bytes (the same
 * `lastFrameUniformBytes` the hover-pick driver uses) to reproduce the
 * frame's camera state.  Those bytes are stashed onto `state.picking` by
 * the `pointSpritesPass` just before `renderFrame`'s submit.  Using a
 * separate encoder means the main-frame submit always lands cleanly; the
 * debug overlay is an append-only overlay, never a mid-frame dependency.
 *
 * The alternative — folding it into renderFrame's encoder as a second pass
 * — would require `renderFrame` to know about the pick texture and the
 * debug overlay renderer, widening its input type for a single dev-only
 * feature.  Keeping it external avoids that coupling.
 *
 * ### Sequencing
 *
 * Called from `runFrame` AFTER `renderFrame(...)` returns (which submits
 * the main frame), and BEFORE the render-on-demand tail (so a debug
 * overlay frame does not prevent the loop from sleeping when nothing else
 * is animated).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SourceMasks } from '../../../@types/engine/frame/SourceMasks';
import { collectPickTargets } from '../helpers/collectPickTargets';
import { milkyWayPickVisible } from '../helpers/milkyWayPickVisible';

/**
 * Narrow dep bag for the overlay helper — only the GPU handles and canvas
 * dimensions it actually reads, so the caller does not need to pass the full
 * `RunFrameDeps`.
 */
export type DrawPickDebugOverlayDeps = {
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly canvas: { readonly width: number; readonly height: number };
};

/**
 * Composite the pick-buffer debug visualisation over the swap chain if
 * `state.settings.debug.showPickBuffer` is on and all required handles are
 * non-null.
 *
 * `masks.pick` is the per-frame pick-visibility bitfield derived by
 * `deriveSourceMasks`; the overlay and the hover driver share the same mask
 * so they agree on what is pickable.
 *
 * Returns immediately (no-op) when:
 *   - `showPickBuffer` is off
 *   - `pickRenderer` or `pickDebugOverlay` is null
 *   - no galaxy catalogs are loaded
 *   - no pick targets are visible this frame (`hasAny === false`)
 *   - `state.picking.lastFrameUniformBytes` is null (no visual frame yet)
 *
 * ### Why `lastFrameUniformBytes` is required
 *
 * The pick renderer re-executes the visual frame's vertex shader using the
 * packed camera + settings snapshot from the last visual frame so the pick
 * texture is pixel-accurate relative to what is on screen.  Passing null
 * would render an incorrect (or blank) overlay; skipping instead is the
 * safer no-op.
 */
export function drawPickDebugOverlay(
  state: EngineState,
  deps: DrawPickDebugOverlayDeps,
  masks: SourceMasks,
): void {
  if (
    !state.settings.debug.showPickBuffer ||
    state.gpu.pickRenderer === null ||
    state.gpu.pickDebugOverlay === null ||
    state.data.galaxies.catalogs.size === 0 ||
    // `ctx.isReady` was proved true before runFrame reaches this helper, but
    // the renderer non-null check re-establishes it for this standalone
    // function's call site (consistent with collectPickTargets's PointRenderer
    // contract, which requires a loaded renderer).
    state.gpu.renderer === null
  ) {
    return;
  }

  const { visibleSources: overlaySources, hasAny } = collectPickTargets(
    state.gpu.renderer,
    masks.pick,
    state.gpu.structureMarkerRenderer,
    milkyWayPickVisible(state),
  );

  const debugUniformBytes = state.picking.lastFrameUniformBytes;
  // Skip until the first visual frame has completed and stashed its bytes.
  // Without a real camera snapshot the pick vertex shader would produce an
  // identity-matrix scene — every galaxy at (0,0) in clip space, making the
  // overlay useless and potentially confusing.
  if (!hasAny || debugUniformBytes === null) return;

  const pickTex = state.gpu.pickRenderer.renderForDebug(
    [deps.canvas.width, deps.canvas.height],
    overlaySources,
    state.settings.galaxyCatalogs.sizePx,
    debugUniformBytes,
  );
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
