/**
 * encodeVolumes — the per-frame pre-HDR scalar-volume raymarch pass.
 *
 * Runs BEFORE the HDR mega-pass (`encodeHdrSingle` / `encodeHdrSplit`).
 * Opens one render pass against the half-resolution offscreen target on
 * `ctx.volumeOffscreen.view`, asks the scalar-volume renderer to
 * iterate every active field and draw it into that target with the
 * additive blend state baked into the pipeline, and closes the pass.  The
 * downstream `volumeUpsamplePass` (one of the entries in `HDR_PASSES`)
 * then bilinearly samples this target and additively composites the
 * result into the HDR target.
 *
 * ### Why this isn't a `Pass` in `HDR_PASSES`
 *
 * Pre-this-change, `scalarVolumePass` lived in `HDR_PASSES` alongside the
 * five other additive contributions, all of which drew INSIDE the same
 * HDR mega-pass (the one `encodeHdrSingle` opens).  Moving the volume
 * raymarch to a half-res target requires opening a render pass against a
 * different colour attachment — which would mean either (a) breaking the
 * "one Pass = one set of draw calls inside the parent HDR render pass"
 * contract or (b) splitting the scalar-volume pass into a pre-HDR step.
 *
 * (b) is the right answer because the `HDR_PASSES` contract is load-
 * bearing for the OVER-blend coherency story (see `encodeHdrSingle.ts`'s
 * docstring): every entry runs inside one open render pass against the
 * HDR target so the OVER-blended UI overlays read coherent `dst.color`.
 * Carving out a pre-step is the minimal-cost path that keeps that
 * contract intact.  The new `volumeUpsamplePass` slot inside
 * `HDR_PASSES` reads the half-res target and contributes into the HDR
 * pass exactly like every other additive entry.
 *
 * ### Why half-res viewport (not canvas viewport) to the renderer
 *
 * `scalarVolumeRenderer.draw` takes a `viewportPx` argument that the
 * shader uses to compute the per-fragment jitter dither's spatial
 * frequency.  Passing the full canvas size when the actual target is
 * half-res would shift the dither pattern's frequency by 2x — visually
 * different (the dither would appear "finer" on the upsampled output).
 * Passing the half-res viewport matches the actual fragment count and
 * keeps the dither pattern consistent with the pre-half-res baseline
 * up to the bilinear blur.
 *
 * ### Why `loadOp: 'clear'` with a `(0, 0, 0, 0)` clearValue
 *
 * Every frame must start the half-res target at exactly zero so the
 * additive sum from frame N doesn't leak into frame N+1.  Alpha=0 is the
 * right additive identity — the upsample pass's additive blend will add
 * `(0, 0, 0, 0)` to HDR with no effect for any fragment the volumes
 * didn't reach.
 */

import type { EncodeVolumesArgs } from '../../../@types/engine/frame/EncodeVolumesArgs';

export function encodeVolumes(args: EncodeVolumesArgs): void {
  const { encoder, ctx, scalarVolumeRenderer, timestampWrites } = args;

  // Brief bootstrap window before initGpu has constructed the renderer.
  // The Pass-level gate in `volumeUpsamplePass.enabled` checks the same
  // null condition; this guard is the matching invariant on the pre-HDR
  // side.
  if (scalarVolumeRenderer === null) return;

  // Half-res viewport: floor(canvas / 2), min 1 px.  Matches the texture
  // dimensions allocated by `postProcess.resize()` (see
  // `services/gpu/passes/postProcess.ts`'s `allocateHalfRes`).  Computed
  // here rather than threaded through the context because (a) it's a
  // pure function of `canvasSize`, (b) keeping it local makes the
  // "viewport == texture size" invariant obvious at the call site.
  const halfW = Math.max(1, Math.floor(ctx.canvasSize.width / 2));
  const halfH = Math.max(1, Math.floor(ctx.canvasSize.height / 2));

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
  scalarVolumeRenderer.draw(
    pass,
    ctx.vp,
    [halfW, halfH],
    [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
  );
  pass.end();
}
