/**
 * encodeUiOverlay — composites the UI overlay layers (marker-lines, labels,
 * future POI labels, …) onto the tone-mapped swap-chain image after
 * the HDR pipeline.
 *
 * ### Why post-tone-map (vs. inside HDR_PASSES)
 *
 * Before this module existed, marker-lines and labels rendered into
 * the `rgba16float` HDR target alongside the additive content (point
 * sprites, milky-way, filaments, …).  That had two problems:
 *
 *   1. **Colour mismatch.**  The HDR target's tone-map compresses
 *      linear-light values; an LDR-sane label colour (`[1, 1, 1, 1]`)
 *      survived as mid-grey after ACES.  The `youAreHereSubsystem`
 *      worked around this by emitting `[8, 8, 8, 1]` so the tone-map
 *      rolled it off to display-white — a brittle hack that broke
 *      whenever the curve or exposure changed.
 *
 *   2. **OVER-blend coherency on tile-based GPUs (M1).**  Marker-lines
 *      and labels use premultiplied OVER, which reads `dst.color` from
 *      the bound render target.  When the per-pass split (for
 *      `?gpuTimings` timing granularity) was active, every `pass.end`
 *      stored the HDR target to DRAM and the next `pass.begin` reloaded
 *      it; stale or partially-coherent reads garbled the OVER blends,
 *      producing the "you are here" marker disappearing or flickering.
 *      The additive HDR passes tolerated the same coherency error
 *      invisibly because their blend factor (`one, one`) doesn't read
 *      `dst.color`.
 *
 * Moving the OVER overlays out of HDR fixes both issues at once.  The
 * swap-chain target is the final output, so we composite onto already
 * tone-mapped values — no overshoot needed.  The single
 * `beginRenderPass` here keeps every UI pass in one tile-local
 * lifetime; the OVER blends read fully-coherent `dst.color` from the
 * previous draw within the same pass.
 *
 * ### Why one combined pass (vs. one per UI_PASSES entry)
 *
 * Splitting UI_PASSES into multiple `beginRenderPass` blocks on the
 * swap chain would re-introduce the M1 OVER-blend coherency problem
 * we just fixed at the HDR target, this time at the swap chain.
 * Combining them costs us per-pass timing granularity, which is why
 * `TIMING_SLOT_NAMES` merges them into one `ui-overlay` slot.  The
 * "two of them add up to a handful of microseconds" reality of UI
 * overlay cost makes separate timing not worth the coherency risk.
 *
 * ### When the pass is opened
 *
 * If no UI_PASSES entry returns true from `enabled()` AND no timing
 * descriptor is attached, the pass is skipped entirely.  When timing
 * is enabled we always open the (possibly draw-free) pass so the
 * `ui-overlay` slot still reports a near-zero duration — the
 * `timestampWrites` descriptor attaches at the pass boundary, not at
 * a draw, so without the open pass the timing slot wouldn't fire.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import type { RenderFrameSettings } from '../../../@types/engine/frame/RenderFrameSettings';
import { UI_PASSES } from './passes';

export function encodeUiOverlay(
  encoder: GPUCommandEncoder,
  swapView: GPUTextureView,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
  deps: PassDeps,
  timestampWrites: GPURenderPassTimestampWrites | undefined,
): void {
  const enabled = UI_PASSES.filter((p) => p.enabled(state, ctx, settings));
  if (enabled.length === 0 && !timestampWrites) return;

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: swapView,
        // `loadOp: 'load'` composites onto the tone-mapped image the
        // post-process pass just wrote into the swap chain.  Clearing
        // here would wipe the tone-mapped HDR content we worked all
        // frame to produce.
        loadOp: 'load',
        storeOp: 'store',
      },
    ],
    ...(timestampWrites ? { timestampWrites } : {}),
  });

  for (const p of enabled) {
    p.draw(pass, ctx, state, settings, deps);
  }

  pass.end();
}
