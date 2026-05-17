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
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
import { HDR_PASSES } from './passes';
import { encodeVolumes } from './encodeVolumes';

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
  // Runs after the clear, before the HDR sub-passes.  Same gate as
  // `encodeHdrSingle`: skip when no fields are active so we don't open
  // an empty render pass.  Timestamp billing reuses the legacy
  // `'scalar-volume'` slot — that's what the DebugPanel's GpuTimings
  // row reads, and keeping the slot name stable means the row's label
  // and historical samples line up.
  // Master gate: settings boolean OR a non-zero master fade tail.
  // See encodeHdrSingle for the master-opacity multiplier rationale.
  if (state.gpu.scalarVolumeRenderer !== null) {
    const nowMs = performance.now();
    const masterOpacity = state.subsystems.fades.opacityOf({ kind: 'volumesMaster' }, nowMs);
    if (settings.volumesEnabled || masterOpacity > 0) {
      const fadeOpacityOf = (handle: string) =>
        state.subsystems.fades.opacityOf({ kind: 'scalarField', field: handle }, nowMs) *
        masterOpacity;
      if (state.gpu.scalarVolumeRenderer.hasActiveFields(fadeOpacityOf)) {
        encodeVolumes({
          encoder,
          ctx,
          scalarVolumeRenderer: state.gpu.scalarVolumeRenderer,
          fadeOpacityOf,
          timestampWrites: timingService.descriptorFor('scalar-volume'),
        });
      }
    }
  }

  // ── HDR sub-passes — one beginRenderPass per enabled pass ─────────
  //
  // The pass-name → slot mapping is statically defined by
  // TIMING_SLOT_NAMES.  `pass.name` is typed `string`, but the
  // HDR_PASSES inhabitants' names are all keys of that table by
  // construction — the cast is safe and documented.  If a future
  // pass file forgets to add a slot, `descriptorFor` returns
  // `undefined` (active-mode lookup miss) — the pass simply isn't
  // measured and still draws.  The optional-spread merge keeps the
  // descriptor byte-identical to the no-timing shape when the
  // result is `undefined`.
  for (const pass of HDR_PASSES) {
    if (!pass.enabled(state, ctx, settings)) continue;

    const timestampWrites = timingService.descriptorFor(pass.name as TimingSlotName);

    const passEncoder = encoder.beginRenderPass({
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
