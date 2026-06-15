/**
 * encodeVolumes — pre-HDR scalar-volume raymarch pass.
 *
 * Runs before the HDR mega-pass (`encodeHdrSingle` / `encodeHdrSplit`).
 * Opens one render pass against the downsampled offscreen target on
 * `ctx.volumeOffscreen.view`, asks `volumeFieldRenderer` to iterate
 * every active field and draw it with the additive blend state baked
 * into the pipeline, and closes the pass.  `volumeUpsamplePass` (an
 * entry in `HDR_PASSES`) bilinearly samples the result and additively
 * composites it into the HDR target.
 *
 * ### Why a separate pre-HDR pass instead of an `HDR_PASSES` entry
 *
 * `HDR_PASSES` contract: every entry draws inside the single open HDR
 * render pass so OVER-blended UI overlays read coherent `dst.color`
 * (see `encodeHdrSingle.ts`).  The volume raymarch's colour attachment
 * is the offscreen — a different target — so it can't share that pass
 * without breaking the contract.  Splitting it off keeps the contract
 * intact; the upsample step rejoins the additive chain inside HDR.
 *
 * ### Why the offscreen viewport (not the canvas viewport) to the renderer
 *
 * `volumeFieldRenderer.draw` takes `viewportPx` to compute the per-
 * fragment jitter dither's spatial frequency.  Passing the canvas size
 * when the actual target is downsampled would shift the dither
 * frequency, making it appear "finer" on the upsampled output.  The
 * offscreen viewport matches the actual fragment count and keeps the
 * dither pattern stable.
 *
 * ### Why `loadOp: 'clear'` with a `(0, 0, 0, 0)` clearValue
 *
 * Each frame must start the offscreen at zero so the additive sum from
 * frame N doesn't leak into N+1.  Alpha=0 is the additive identity —
 * the upsample pass's additive blend adds `(0, 0, 0, 0)` to HDR with
 * no effect for any fragment the volumes didn't reach.
 */

import type { EncodeVolumesArgs } from '../../../@types/engine/frame/EncodeVolumesArgs';
import { VOLUME_RENDER_SCALE_DIVISOR } from '../../gpu/passes/volumeOffscreen';

export function encodeVolumes(args: EncodeVolumesArgs): void {
  const { encoder, ctx, volumeFieldRenderer, settingsOf, fadeOpacityOf, timestampWrites } = args;

  // Two-part gate:
  //
  //   1. Bootstrap window before initGpu has constructed the renderer
  //      (null guard).
  //   2. Renderer exists but no field is active or has intensity > 0 —
  //      `volumeUpsamplePass.enabled` checks the same condition, and
  //      the upsample blit is the consumer of whatever we'd write here.
  //      Skipping the pass avoids one tile-RAM round-trip per frame
  //      on M1 for a cleared-but-unused offscreen target.
  if (volumeFieldRenderer === null || !volumeFieldRenderer.hasActiveFields(settingsOf, fadeOpacityOf))
    return;

  // Viewport matches `volumeOffscreen`'s texture size, per the shared
  // `VOLUME_RENDER_SCALE_DIVISOR`.  Computed inline (not threaded
  // through the context) so the "viewport == texture size" invariant
  // is obvious at the draw site.  Min 1 px guards small canvases.
  const vw = Math.max(1, Math.floor(ctx.canvasSize.width / VOLUME_RENDER_SCALE_DIVISOR));
  const vh = Math.max(1, Math.floor(ctx.canvasSize.height / VOLUME_RENDER_SCALE_DIVISOR));

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.volumeOffscreen.view,
        // Alpha=0 is the additive identity; see module header.
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    // Spread-if pattern matches `encodeHdrSplit.ts` — keeps the
    // descriptor byte-identical to the no-timing shape when
    // `timestampWrites` is undefined, so the visual baseline doesn't
    // shift between production and dev-with-timings.
    ...(timestampWrites ? { timestampWrites } : {}),
  });
  volumeFieldRenderer.draw(
    pass,
    ctx.vp,
    [vw, vh],
    [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    settingsOf,
    fadeOpacityOf,
  );
  pass.end();
}
