/**
 * StarCatalogPickRenderer — the r32uint pick provider for the survey stars, the
 * pick twin of `StarCatalogRenderer`. Owns no pass, texture or readback: the
 * pick program begins the pass and drives the readback. It shares the visual
 * renderer's layouts, records and cut lists (`StarCatalogPickResources`) and
 * writes only its own `StarUniforms` (`pickPass = 1`), so a pick draw never
 * scribbles on the visual camera buffer. Depth-tested, so the nearest star wins
 * a pixel (the visual pass is depthless and additive).
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { StarCatalogPickDrawArgs } from './StarCatalogPickDrawArgs';

export type StarCatalogPickRenderer = Renderer & {
  /**
   * Record one source's leaf list into an already-begun r32uint pick pass. No-op
   * if the source has no committed catalog or the cut has not run for it.
   */
  draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void;
};
