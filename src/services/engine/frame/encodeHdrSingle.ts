/**
 * encodeHdrSingle — collapses all enabled HDR_PASSES into one
 * `beginRenderPass` / `pass.end` block.  This is the default production
 * path (taken when `timingService === null`, i.e. no `?gpuTimings`).
 *
 * ### Why a single mega-pass
 *
 * On tile-based GPUs (Apple Silicon M1/M2, Adreno, Mali) the render
 * target lives in tile-local memory for the duration of one open render
 * pass — no DRAM round-trip between draws.  Premultiplied-OVER passes
 * (`marker-lines`, `labels`) read `dst.color` from the same tile their
 * predecessor just wrote into, so the OVER blend is computed against
 * fully-coherent state.
 *
 * The companion split path (`encodeHdrSplit`) breaks that
 * guarantee: every `pass.end` stores the target to DRAM and the next
 * `pass.begin` reloads it.  On M1 we've observed the OVER overlays
 * render with stale or partially-coherent `dst.color` — the marker
 * line and "You are here" label disappear or flicker at low alpha.
 * The additive passes (point sprites, milky-way, filaments, scalar
 * volume) tolerate the same coherency error invisibly because their
 * blend (`srcFactor: 'one', dstFactor: 'one'`) doesn't read `dst.color`
 * at all.
 *
 * ### Why we can't attach `timestampWrites` here
 *
 * WebGPU's `timestamp-query` feature attaches timestamps to pass
 * BOUNDARIES (beginning + end of pass), not to individual draws within
 * a pass.  Per-pass GPU timing therefore requires one
 * `beginRenderPass` per pass — the split path.  This helper is the
 * "production performance + correctness" branch; the split helper is
 * the "developer profiler" branch.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import { HDR_PASSES } from './passes';
import { encodeVolumePrepass } from './encodeVolumePrepass';
import { encodeFlowCompute } from './encodeFlowCompute';
import { slotReady } from '../../loading/slotReady';

export function encodeHdrSingle(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  deps: PassDeps,
): void {
  // ── Half-resolution scalar-volume pre-pass ────────────────────────────
  //
  // Runs BEFORE the HDR mega-pass opens.  Encodes one render pass against
  // the half-res offscreen target so every active scalar-field cube can
  // raymarch into a quarter-fragment target.  The downstream
  // `volumeUpsamplePass` (one of the HDR_PASSES entries) bilinearly samples
  // the half-res target and additively blends into the HDR target.
  //
  // Shared with `encodeHdrSplit` via `encodeVolumePrepass`; this path
  // passes `null` for the timing service (no per-pass GPU timing in the
  // production single-pass branch), so the prepass's lazy
  // `timingService?.descriptorFor(...)` yields `undefined`.
  encodeVolumePrepass(encoder, ctx, state, null);

  // ── Flow-field compute pre-pass ───────────────────────────────────────
  // Encodes the particle seed/integrate compute into this same encoder,
  // before the HDR mega-pass, so the ribbon draw (flowFieldPass) reads
  // freshly-advanced trails. Self-gates on enabled + loaded.
  encodeFlowCompute({
    encoder,
    flowFieldRenderer: state.gpu.flowFieldRenderer,
    flow: state.settings.flow,
    loaded: slotReady(state.assetSlots.flow),
  });

  const hdrPass = encoder.beginRenderPass({
    label: 'hdr-pass',
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  // `settings.debug.disabledPasses` is the DebugPanel's renderer-toggle
  // surface — checked AFTER the pass's own `enabled()` gate so the override is
  // one-way (hides a pass that would otherwise run; can never force-enable a
  // pass whose gate returned false).  Read once off the live settings snapshot;
  // empty in production, so the membership lookup is in the noise.
  const disabledPasses = state.settings.debug.disabledPasses;
  for (const pass of HDR_PASSES) {
    if (!pass.enabled(state, ctx)) continue;
    if (disabledPasses[pass.name] === true) continue;
    pass.draw(hdrPass, ctx, state, deps);
  }

  hdrPass.end();
}
