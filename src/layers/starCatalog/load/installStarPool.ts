/**
 * installStarPool — the star layer's side of `installOctreePool`: resolves the
 * registry row once, so the shared runtime never reads the registry, and hands
 * it the pool size and the star chunk format.
 */
import { STAR_CATALOG_SOURCE_RECORD } from '../sources/starCatalogSourceRecord';
import { installOctreePool } from '../../../services/octree/installOctreePool';
import { octreeChunkPath } from '../../../utils/octree/octreeChunkPath';
import { octreePoolShape } from '../../../utils/octree/octreePoolShape';
import { starColumnsOf } from '../../../utils/star/starColumnsOf';
import type { StarCatalogSourceType } from '../@types/StarCatalogSourceType';
import type { Tier } from '../../../@types/data/Tier';
import type { StarColumns } from '../../../@types/data/starCatalog/StarColumns';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreePoolHost } from '../../../@types/octree/OctreePoolHost';

export function installStarPool(
  host: OctreePoolHost<StarColumns>,
  source: StarCatalogSourceType,
  octree: Octree<StarColumns>,
  tier: Tier,
  poolRecordsOverride: number | null,
): void {
  const entry = STAR_CATALOG_SOURCE_RECORD[source];
  if (entry.binBaseName === null) {
    throw new Error(`installStarPool: source ${source} is not a streamed star catalog`);
  }
  const { binBaseName } = entry;
  const poolRecords = poolRecordsOverride ?? entry.budgets[tier].poolRecords;
  const pool = octreePoolShape(octree, poolRecords, entry.poolNodesPerRecord);
  installOctreePool(host, source, octree, pool, {
    chunkPath: (ref) => octreeChunkPath('star', binBaseName, ref),
    decodeRecords: starColumnsOf,
  });
}
