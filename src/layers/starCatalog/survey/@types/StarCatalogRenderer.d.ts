/**
 * StarCatalogRenderer — the survey (Gaia bin) stars as additive point sprites
 * in the depthless HDR accumulation. `upload` commits a catalog once; the
 * per-frame octree cut is taken on the GPU from the inputs `setFrameCut` holds.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { StarCatalogSourceType } from '../../@types/StarCatalogSourceType';
import type { OctreeChunk } from '../../../../@types/octree/OctreeChunk';
import type { Octree } from '../../../../@types/octree/Octree';
import type { StarCatalogPickResources } from './StarCatalogPickResources';
import type { StarCutInputs } from '../../octreeCut/@types/StarCutInputs';
import type { StarCatalogCutDrawArgs } from '../../octreeCut/@types/StarCatalogCutDrawArgs';
import type { ClaimTimestampWrites } from '../../../../@types/gpu/timing/ClaimTimestampWrites';
import type { StarColumns } from './StarColumns';

export type StarCatalogRenderer = Renderer & {
  /**
   * Commit one catalog's index to pool-sized per-source GPU buffers, replacing any earlier
   * upload; `min(slots, octree.chunkCount)` chunk slots follow the index, and that pool
   * size is returned for the chunk stream to match.
   */
  upload(source: StarCatalogSourceType, octree: Octree<StarColumns>, slots: number): number;
  /** Destroy one catalog's GPU buffers, records and cut alike, so a switched-off catalog holds no VRAM. */
  release(source: StarCatalogSourceType): void;
  /**
   * Land a chunk in a slot: its records and rows, then every root's resident bit, written in
   * the rows of `hostSlot` (its parent's slot; null when the index holds its roots).
   */
  uploadChunk(
    source: StarCatalogSourceType,
    slot: number,
    chunk: OctreeChunk<StarColumns>,
    hostSlot: number | null,
  ): void;
  /** Free a slot: every root of its chunk stops refining, then the slot's row count is cleared. */
  evictChunk(source: StarCatalogSourceType, slot: number, hostSlot: number | null): void;
  /**
   * Called by every star pick draw: `recordOrdinal` reads the slots as that draw saw them. The
   * DEV pick overlay records the same draws each frame, so with it on the snapshot follows the
   * pool again.
   */
  snapshotPickSlots(): void;
  /**
   * A pool-absolute record index (what the pick draw stamps) as the catalog ordinal, or null
   * when its slot was empty or the index names no record. Read through the slot → chunk table
   * of the last pick draw, so a slot evicted and refilled before the readback still names the
   * star that was drawn; the selection row then finds its chunk gone, never another star.
   */
  recordOrdinal(source: StarCatalogSourceType, poolIndex: number): number | null;
  /** The inverse: null when the ordinal's chunk is not resident. */
  poolRecordIndex(source: StarCatalogSourceType, ordinal: number): number | null;
  /** Every committed catalog — the star analogue of `catalogStore.entries()`. */
  loadedCatalogs(): Iterable<{ source: StarCatalogSourceType; octree: Octree<StarColumns> }>;
  /** What the sibling `starCatalogPickRenderer` shares; see {@link StarCatalogPickResources}. */
  pickResources(): StarCatalogPickResources;
  /**
   * The frame's one cut: set by the Layer's planner, encoded by `encodeCut`, read by every
   * `drawCut` and the pick draw. `recut` false keeps the last cut's lists and fades and moves
   * only the eye the draws rebuild positions about.
   */
  setFrameCut(cut: StarCutInputs | null, recut: boolean): void;
  getFrameCut(): StarCutInputs | null;
  /** The frame cut's compute pass; nothing when no cut is set. */
  encodeCut(encoder: GPUCommandEncoder, claimTimestampWrites: ClaimTimestampWrites): void;
  /** One stream of the cut for one source, drawn from the GPU's lists. */
  drawCut(pass: GPURenderPassEncoder, args: StarCatalogCutDrawArgs): void;
};
