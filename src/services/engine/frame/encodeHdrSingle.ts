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
import type { RenderFrameSettings } from '../../../@types/engine/frame/RenderFrameSettings';
import { HDR_PASSES } from './passes';
import { encodeVolumes } from './encodeVolumes';

export function encodeHdrSingle(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  settings: RenderFrameSettings,
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
  // Gating: `encodeVolumes` carries its own null + hasActiveFields guard
  // for direct callers, but the call-site gate below makes it unreachable
  // here by construction.  The duplication is deliberate — gating at the
  // call site avoids even the function-call overhead, and on tile-based
  // GPUs an empty `beginRenderPass(loadOp: 'clear')` is still a non-zero
  // cost (tile-RAM load+store) even when nothing draws inside.  The
  // downstream `volumeUpsamplePass.enabled` checks the same conditions
  // on the HDR side; the two layers stay in lockstep.
  // Master gate: settings boolean OR a non-zero master fade tail.
  // The fadeOpacityOf closure below multiplies the master opacity
  // into every per-field lookup so a master fade-out smoothly drags
  // every field down in lockstep.
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
          timestampWrites: undefined,
        });
      }
    }
  }

  const hdrPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  for (const pass of HDR_PASSES) {
    // `state.debug.disabledPasses` is the DebugPanel's renderer-toggle
    // surface — checked AFTER the pass's own `enabled()` gate so the
    // override is one-way (hides a pass that would otherwise run; can
    // never force-enable a pass whose gate returned false).  Set is
    // empty in production, so the membership check is in the noise.
    if (!pass.enabled(state, ctx, settings)) continue;
    if (state.debug.disabledPasses.has(pass.name)) continue;
    pass.draw(hdrPass, ctx, state, settings, deps);
  }

  hdrPass.end();
}
