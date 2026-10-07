/**
 * StarCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation. `upload` commits a catalog once; the
 * per-frame octree cut is taken on the GPU from the inputs `setFrameCut` holds.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogPickResources } from './StarCatalogPickResources';
import type { StarCutInputs } from './StarCutInputs';
import type { StarCatalogCutDrawArgs } from './StarCatalogCutDrawArgs';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';

export type StarCatalogRenderer = Renderer & {
  /** Commit one catalog's records and octree to per-source GPU buffers, replacing any earlier upload. */
  upload(source: SourceType, catalog: StarCatalog): void;
  /** Every committed catalog — the star analogue of `catalogStore.entries()`. */
  loadedCatalogs(): Iterable<{ source: SourceType; catalog: StarCatalog }>;
  /** What the sibling `starCatalogPickRenderer` shares; see {@link StarCatalogPickResources}. */
  pickResources(): StarCatalogPickResources;
  /** The frame's one cut: set by the Layer's planner, encoded by `encodeCut`, read by every `drawCut` and the pick draw. */
  setFrameCut(cut: StarCutInputs | null): void;
  getFrameCut(): StarCutInputs | null;
  /** The frame cut's compute pass; nothing when no cut is set. */
  encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void;
  /** One stream of the cut for one source, drawn from the GPU's lists. */
  drawCut(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs): void;
};
