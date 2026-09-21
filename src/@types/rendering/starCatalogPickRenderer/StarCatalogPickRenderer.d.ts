/**
 * StarCatalogPickRenderer — the r32uint pick provider for the survey (Gaia bin)
 * stars, the pick twin of `StarCatalogRenderer`.
 *
 * It records one source's leaf cut into an already-begun r32uint pick pass,
 * where each fragment writes the picked star's packed identity
 * (`(SOURCE_GAIA_STARS << 26) | recordIdx`, see `starCatalog/pickFragment.wesl`).
 * It owns no pass, no texture and no readback — the pick program begins the
 * pass and drives the readback; this renderer is one `drawPick` provider among
 * the pickable rows, the star analogue of the galaxy points `PickRenderer`.
 *
 * ### Why it re-packs its own buffers but re-uses the records blob
 *
 * The renderer shares the visual `StarCatalogRenderer`'s static per-source
 * records bind group (uploaded once, bound verbatim) but packs its OWN
 * per-source nodeParams/prefix buffers and its OWN `StarUniforms` buffer with
 * `pickPass = 1`. Owning those is the writeBuffer/submit landmine fix: a pick
 * draw encoded into the pick pass in the same frame as a visual draw must never
 * write the visual renderer's live buffers, or the queued writes would race at
 * submit. The visual renderer's buffers are never touched.
 *
 * ### Why depth-tested (the visual star pass is depthless)
 *
 * The visual star pass is additive and depthless so overlapping glows brighten.
 * The pick pass instead wants a SINGLE claimant per pixel — the nearest star —
 * so its pipeline carries a `depth32float` (`NEAR0_DEPTH_FORMAT`) attachment
 * with `depthCompare: 'greater'` + `depthWriteEnabled: true`. Under the NEAR0
 * slab's reversed-Z convention (clear `0.0`, greater-z-wins) a nearer star writes
 * a LARGER stored depth, so `greater` is what makes the star in front of a dim
 * one win the pixel, matching visual occlusion.
 */

import type { Renderer } from '../Renderer';
import type { StarCatalogPickDrawArgs } from './StarCatalogPickDrawArgs';

export type StarCatalogPickRenderer = Renderer & {
  /**
   * Record one source's leaf cut into an already-begun r32uint pick pass. Packs
   * its OWN per-source nodeParams/prefix buffers and its OWN `pickPass = 1`
   * uniform, then binds the source's SHARED records bind group. No-op if the
   * source has no committed catalog or the cut is empty.
   */
  draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void;
};
