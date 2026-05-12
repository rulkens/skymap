import type { Source } from '../../../data/sources';
import type { Tier } from '../../data/Tier';
import type { Fetcher } from '../../loading/Fetcher';
import type { PointCloud } from '../../data/PointCloud';
import type { PointCloudReq } from '../../loading/PointCloudReq';

/**
 * One row of the registry.
 *
 * The fields capture exactly the dimensions that vary across the five
 * point-source slots; everything else (slot name shape, commit body,
 * subscriber side effects) is uniform and lives in
 * `wirePointSourceSlot`.
 */
export type PointSourceConfig = {
  /** Which catalog this slot represents. */
  source: Source;
  /**
   * Fetcher used to materialise the slot's request into a PointCloud.
   * The four real surveys share `pointCloudFetcher` (which dispatches
   * on `req.source` to pick the right .bin URL); Synthetic uses
   * `syntheticPointFetcher` (which procedurally generates a cloud and
   * ignores `req.tier`).
   */
  fetcher: Fetcher<PointCloud, PointCloudReq>;
  /**
   * Declarative initial tier for the slot.  See the module-header
   * "Why initialTier lives on the config but isn't read by the helper"
   * note — this field is for forward-uniformity with the spec; the
   * actual first-load tier today comes from `state.sources.tier`.
   */
  initialTier: Tier;
};
