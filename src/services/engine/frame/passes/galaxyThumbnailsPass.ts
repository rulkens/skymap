/**
 * galaxyThumbnailsPass — per-galaxy thumbnail quads + procedural
 * disk impostors.
 *
 * ### What it draws
 *
 * Two sub-renderers driven by the thumbnail subsystem:
 *
 *   1. `thumbnailRenderer` — atlas-backed textured billboards for galaxies
 *      whose JPEG/WebP cutouts have been fetched and uploaded to the
 *      2048×2048 LRU atlas.
 *   2. `diskRenderer` — view-aligned procedural ellipses for galaxies
 *      whose apparent size is large enough for the disk to look like
 *      more than a point but whose thumbnail hasn't landed yet (or
 *      whose source doesn't have a thumbnail provider).
 *
 * The subsystem owns the back-to-front sort, the atlas LRU, and the
 * fetch queue priority — this pass just calls `runFrame(...)` and
 * forwards every per-frame value the subsystem reads.
 *
 * ### When it draws
 *
 * Gated on `settings.galaxyTexturesEnabled`.  The toggle is
 * user-facing (Settings panel → "Galaxy thumbnails"); when off, no
 * fetches start, no atlas writes happen, and the entire pass costs
 * one boolean check per frame.
 *
 * ### What it reads
 *
 * - `ctx.thumbnails` (the bootstrap-narrowed `ThumbnailSubsystem`)
 * - `ctx.cam`, `ctx.vp`, `ctx.canvasSize`, `ctx.drawCamPos`,
 *   `ctx.drawPxPerRad` — forwarded into `runFrame`
 * - `settings.visibleSourceMask` — mirror the points-pass culling
 *   rule so disabled surveys don't fetch thumbnails
 * - `deps.clouds`, `deps.famousMeta`, `deps.famousXrefs`,
 *   `deps.thumbnailRenderer`, `deps.diskRenderer` — every other
 *   `runFrame` argument
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const galaxyThumbnailsPass: Pass = {
  name: 'galaxy-thumbnails',

  enabled(_state, _ctx, settings) {
    return settings.galaxyTexturesEnabled;
  },

  draw(pass, ctx, _state, settings, deps) {
    const { cam, vp, canvasSize, drawCamPos, drawPxPerRad, thumbnails } = ctx;

    thumbnails.runFrame({
      cam,
      clouds: deps.clouds,
      visibleSourceMask: settings.visibleSourceMask,
      canvasSize: { width: canvasSize.width, height: canvasSize.height },
      pass,
      viewProj: vp,
      pxPerRad: drawPxPerRad,
      camPos: drawCamPos,
      thumbnailRenderer: deps.thumbnailRenderer,
      diskRenderer: deps.diskRenderer,
      famousMeta: deps.famousMeta,
      famousXrefs: deps.famousXrefs,
    });
  },
};
