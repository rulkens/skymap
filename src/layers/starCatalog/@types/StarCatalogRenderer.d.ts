/**
 * StarCatalogRenderer — handle for the survey (Gaia bin) stars drawn as
 * additive point sprites into the depthless HDR accumulation: millions of
 * catalogued stars streamed as an in-file octree of cell-quantized 6-byte
 * records. The octree lets it draw a flux mip — near cells refined to their
 * real leaf stars, far subtrees collapsed to one aggregate record — so the
 * drawn instance count stays inside a budget regardless of catalog size.
 * `upload` commits a catalog once; the per-frame cut over it is taken on the
 * GPU from the inputs `setFrameCut` holds.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogPickResources } from './StarCatalogPickResources';
import type { StarCutFrame } from './StarCutFrame';
import type { StarCatalogCutDrawArgs } from './StarCatalogCutDrawArgs';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';

export type StarCatalogRenderer = Renderer & {
  /**
   * Commit one catalog's records and octree to per-source GPU buffers (once),
   * keyed by source code. Replaces any previous upload for the same source.
   */
  upload(source: SourceType, catalog: StarCatalog): void;
  /** Every committed catalog — the star analogue of `catalogStore.entries()`. */
  loadedCatalogs(): Iterable<{ source: SourceType; catalog: StarCatalog }>;
  /**
   * Expose the resources the sibling `starCatalogPickRenderer` shares to stay
   * bind-group compatible. See {@link StarCatalogPickResources}.
   */
  pickResources(): StarCatalogPickResources;
  /**
   * The frame's one star cut, as inputs: set once by the Layer's planner,
   * turned into draw lists on the GPU by `encodeCut`, read by every `drawCut`
   * and by the pick renderer.
   */
  setFrameCut(cut: StarCutFrame | null): void;
  getFrameCut(): StarCutFrame | null;
  /** The frame cut's compute pass; nothing when no cut is set. */
  encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void;
  /** One stream of the cut for one source, drawn from the GPU's lists. */
  drawCut(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs): void;
};
