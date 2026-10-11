/**
 * StarCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation. `upload` commits a catalog once; the
 * per-frame octree cut is taken on the GPU from the inputs `setFrameCut` holds.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { SourceType } from '../../../@types/data/SourceType';
import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarCatalogPickResources } from './StarCatalogPickResources';
import type { StarCutInputs } from './StarCutInputs';
import type { StarCatalogCutDrawArgs } from './StarCatalogCutDrawArgs';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';

export type StarCatalogRenderer = Renderer & {
  /**
   * Commit one catalog's index to pool-sized per-source GPU buffers, replacing any earlier
   * upload; `slots = min(slots, octree.chunks.length)` chunk slots follow the index.
   */
  upload(source: SourceType, octree: StarOctree, slots: number): void;
  /** Land a chunk in a slot: its records and rows, then its root's resident bit. */
  uploadChunk(source: SourceType, slot: number, chunk: StarChunk): void;
  /** Free a slot: its root stops refining, then its rows are zeroed. */
  evictChunk(source: SourceType, slot: number): void;
  /**
   * A pool-absolute record index (what the pick draw stamps) as the catalog ordinal, or null
   * when its slot is empty or the index names no record. Read through the renderer's own
   * slot → chunk table, so a pick raced by an eviction resolves to null, never another star.
   */
  recordOrdinal(source: SourceType, poolIndex: number): number | null;
  /** The inverse: null when the ordinal's chunk is not resident. */
  poolRecordIndex(source: SourceType, ordinal: number): number | null;
  /** Every committed catalog — the star analogue of `catalogStore.entries()`. */
  loadedCatalogs(): Iterable<{ source: SourceType; octree: StarOctree }>;
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
