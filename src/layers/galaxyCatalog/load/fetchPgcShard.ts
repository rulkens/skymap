import type { PgcShard } from '../@types/PgcShard';
import { decodeOctreeInfo } from '../../../data/octree/decodeOctreeInfo';
import { GALAXY_OCTREE_FAMILY } from '../../../data/octree/galaxyOctreeFamily';

/** Pgc shard `k` of a galaxy octree (`<name>.pgc-<k>.bin`, written by `buildGladeShards`); null on a miss. */
export async function fetchPgcShard(
  name: string,
  k: number,
  fetchBytes: (path: string) => Promise<ArrayBuffer | null>,
): Promise<PgcShard | null> {
  const buf = await fetchBytes(`${GALAXY_OCTREE_FAMILY.dataPrefix}/${name}.pgc-${k}.bin`);
  if (buf === null) return null;
  const { columns } = decodeOctreeInfo(buf, ['objId', 'ordinal']);
  return {
    objId: columns.get('objId') as BigUint64Array,
    ordinal: columns.get('ordinal') as Float32Array,
  };
}
