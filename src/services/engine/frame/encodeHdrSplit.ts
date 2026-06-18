/**
 * encodeHdrSplit — opens one `beginRenderPass` per enabled
 * HDR_PASSES entry so each pass can carry its own `timestampWrites`
 * descriptor.  This path runs only when `timingService` is non-null
 * (i.e. `?gpuTimings` is active).
 *
 * ### Why a dedicated clear pass at the top
 *
 * If `HDR_PASSES[0]` is gated off (`enabled() === false`), folding the
 * clear into the first sub-pass would silently drop the clear too.  A
 * no-draw clear pass at the head keeps the clear as a frame-lifecycle
 * invariant — it always runs, regardless of which sub-passes are
 * enabled this frame.
 *
 * ### Coherency caveat (why this is the developer-only path)
 *
 * On tile-based GPUs (Apple Silicon M1/M2, Adreno, Mali), each
 * `pass.end` / `beginRenderPass(loadOp: 'load')` boundary stores and
 * reloads the render target through DRAM.  Premultiplied-OVER passes
 * (marker-lines, labels) reading `dst.color` between boundaries see
 * stale or partially-coherent data on M1, causing the OVER overlays
 * to render at wrong alpha.  Additive passes tolerate this invisibly
 * because their blend factor (`srcFactor: 'one', dstFactor: 'one'`)
 * doesn't read `dst.color`.
 *
 * The single-pass path (`encodeHdrSingle`) avoids the issue by
 * keeping all draws in one tile-local pass.  We pay the M1 coherency
 * cost here only because timestamp-query attaches to pass boundaries
 * and per-pass GPU timing has no other shape.
 */

import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { PassDeps } from '../../../@types/engine/frame/PassDeps';
import type { RenderFrameSettings } from '../../../@types/engine/frame/RenderFrameSettings';
import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import { HDR_PASSES } from './passes';
import { encodeVolumePrepass } from './encodeVolumePrepass';
import { encodeFlowCompute } from './encodeFlowCompute';
import { slotReady } from '../../loading/slotReady';

export function encodeHdrSplit(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
  deps: PassDeps,
  timingService: GpuTimingService,
): void {
  // ── Clear pass (no draws) ─────────────────────────────────────────
  const clearPass = encoder.beginRenderPass({
    label: 'hdr-clear',
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  clearPass.end();

  // ── Half-resolution scalar-volume pre-pass ────────────────────────
  //
  // Runs after the clear, before the HDR sub-passes.  Shared with
  // `encodeHdrSingle` via `encodeVolumePrepass`; the only difference is
  // the timing service argument.  The prepass resolves the descriptor
  // lazily (only when the volume pass actually encodes), billing against
  // the legacy `'scalar-volume'` slot — that's what the DebugPanel's GpuTimings row
  // reads, and keeping the slot name stable means the row's label and
  // historical samples line up.
  encodeVolumePrepass(encoder, ctx, state, settings, timingService);

  // ── Flow-field compute pre-pass ───────────────────────────────────
  // Same pre-HDR compute dispatch as the single-pass branch; runs before
  // the per-pass HDR loop so the ribbon draw reads freshly-advanced trails.
  encodeFlowCompute({
    encoder,
    flowFieldRenderer: state.gpu.flowFieldRenderer,
    flow: state.settings.flow,
    loaded: slotReady(state.assetSlots.flow),
  });

  // ── HDR sub-passes — one beginRenderPass per enabled pass ─────────
  //
  // Each pass's `name` IS its timing-slot name: the service's slot map
  // is built from `TIMED_SLOT_NAMES`, which splices in every HDR pass
  // name, so `descriptorFor(pass.name)` resolves by construction.  No
  // cast is needed (both are `string`).  Were a pass somehow absent from
  // the registry, `descriptorFor` would return `undefined` and the pass
  // would simply draw untimed; the optional-spread merge keeps the
  // descriptor byte-identical to the no-timing shape in that case.
  // DebugPanel renderer-toggle override — same one-way semantics as the
  // single-pass branch in `encodeHdrSingle`.  Read once off the live settings
  // snapshot; the per-pass skip below happens BEFORE opening the render pass so
  // a disabled pass costs nothing beyond the membership check (no empty
  // `beginRenderPass` round-trip, no timestamp slot written).
  const disabledPasses = state.settings.debug.disabledPasses;
  for (const pass of HDR_PASSES) {
    if (!pass.enabled(state, ctx, settings)) continue;
    if (disabledPasses[pass.name] === true) continue;

    const timestampWrites = timingService.descriptorFor(pass.name);

    const passEncoder = encoder.beginRenderPass({
      label: `hdr-${pass.name}`,
      colorAttachments: [
        {
          view: ctx.postProcess.view,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
      ...(timestampWrites ? { timestampWrites } : {}),
    });
    pass.draw(passEncoder, ctx, state, settings, deps);
    passEncoder.end();
  }
}
