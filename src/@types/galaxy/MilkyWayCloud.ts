/**
 * MilkyWayCloud — the resource handle for the app's Milky Way point cloud: the
 * GPU-generated star/dust buffers, a way to regenerate them when the data tier
 * changes, and a teardown. It is the app-side analogue of one central galaxy
 * in `createGalaxyEngine.ts`, reduced to the single fixed preset the Milky Way
 * needs (`MILKY_WAY_GALAXY_PARAMS`) — no per-galaxy params surface, because the
 * only thing that ever varies is the tier's star budget.
 *
 * `buffers()` returns the CURRENT generation's buffers as a snapshot; the draw
 * side calls it each frame and never caches across a `regenerate`. `regenerate`
 * is the tier-switch entry point — it destroys the previous star/dust buffers,
 * carves the new tier's layout, and dispatches a fresh generation. `destroy`
 * releases everything including the reused generation UBO.
 */
import type { Tier } from '../data/Tier';
import type { MilkyWayCloudBuffers } from './MilkyWayCloudBuffers';

export type MilkyWayCloud = {
  readonly buffers: () => MilkyWayCloudBuffers;
  /** carve -> destroy old VBs -> create new -> pack UBO -> encode both compute passes -> submit. */
  readonly regenerate: (tier: Tier) => void;
  readonly destroy: () => void;
};
