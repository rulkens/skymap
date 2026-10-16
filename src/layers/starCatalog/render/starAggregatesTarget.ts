/**
 * `star-aggregates` — the low-res offscreen the AGGREGATE octree-node stream
 * draws its additive glow into (fill-bound: tens-to-hundreds of overdraw at
 * kpc-scale zoom, and near the Sun every unfetched chunk root's glow). `star-upsample`
 * composites it back into HDR, re-applying the hue-preserving knee to the summed field.
 * `STAR_AGGREGATE_DIVISOR`'s square is the fragment-count reduction (4 → 1/16): on a
 * phone at Earth the pass fell from ~20 ms at 2 to ~6 ms, the glow field still reading.
 */

import type { RenderTargetSpec } from '../../../@types/engine/frame/RenderTargetSpec';
import { HDR_TARGET_FORMAT } from '../../../data/renderTargetFormats';

export const STAR_AGGREGATE_DIVISOR = 4;

export const STAR_AGGREGATES_TARGET: RenderTargetSpec = {
  id: 'star-aggregates',
  format: HDR_TARGET_FORMAT,
  depth: null,
  scale: STAR_AGGREGATE_DIVISOR,
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
};
