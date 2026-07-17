/**
 * StarCatalogPickRenderer — the r32uint pick provider for the survey (Gaia bin)
 * stars, the pick twin of `StarCatalogRenderer`.
 *
 * It records one source's leaf cut into an already-begun r32uint pick pass,
 * where each fragment writes the picked star's packed identity
 * (`(SOURCE_GAIA_STARS << 27) | recordIdx`, see `starCatalog/pickFragment.wesl`).
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
 * with `depthCompare: 'less'` + `depthWriteEnabled: true`. A bright star in
 * front of a dim one therefore wins the pixel, matching visual occlusion.
 */

import type { Renderer } from './Renderer';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { SourceType } from '../data/SourceType';
import type { StarNodeDraw } from '../../services/gpu/renderers/starCatalog/walkStarOctreeCut';

/**
 * One source's per-frame LEAF cut, as the pick pass draws it — a subset of the
 * visual `StarCatalogDrawArgs`. Only the leaf stream is pickable (a picked star
 * is always a real-star record; an aggregate glow stands in for a whole
 * subtree), so there is no `stream` field and `isAggregate` is packed 0 for
 * every draw. The per-node arrays are parallel: index `i` of `originRelCamMpc` /
 * `cellScaleMpc` describes `nodeDraws[i]` — the node box origin + edge that
 * reconstruct each record's true world position (the same reconstruction the
 * visual pass and `resolveStarRecord` use, so the pick lands exactly where the
 * sprite drew).
 */
export type StarCatalogPickDrawArgs = {
  /** Which loaded catalog's records buffer to bind (its shared records bind group). */
  readonly source: SourceType;
  /** Rebased camera-relative view-projection (`narrowMat4(rebaseViewProj(...))`). */
  readonly vp: Float32Array;
  /** Viewport size in physical pixels — feeds the pixel-size-to-clip conversion. */
  readonly viewportPx: Vec2;
  /** The chosen leaf octree nodes to draw (from `walkStarOctreeCut`, opacity > 0). */
  readonly nodeDraws: readonly StarNodeDraw[];
  /** Per-node box origin, camera-relative Mpc (parallel to `nodeDraws`). */
  readonly originRelCamMpc: readonly Vec3[];
  /** Per-node box edge in Mpc, the in-cell offset unit (parallel to `nodeDraws`). */
  readonly cellScaleMpc: readonly number[];
  /**
   * User's base star-dot size in px (`settings.starCatalogs.sizePx`). The pick
   * billboard is sized by the same leaf legibility ramp as the visual dot so the
   * clickable area tracks what the eye sees, then floored to a ~3 px minimum in
   * the vertex stage's pick branch so a sub-pixel star stays clickable.
   */
  readonly sizePx: number;
};

export type StarCatalogPickRenderer = Renderer & {
  /**
   * Record one source's leaf cut into an already-begun r32uint pick pass. Packs
   * its OWN per-source nodeParams/prefix buffers and its OWN `pickPass = 1`
   * uniform, then binds the source's SHARED records bind group. No-op if the
   * source has no committed catalog or the cut is empty.
   */
  draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void;
};
