/**
 * createChunkPairCache — a galaxy chunk's render and info objects by ref for a lookup (a
 * row, a position descent), kept apart from the render pool so a lookup never takes a slot
 * from what is drawn; a resident chunk lends its render object, so only the info is fetched.
 * LRU by insertion order of a `Map`: a hit re-inserts. A miss or a throw leaves the cache,
 * so a later ask retries.
 */
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { GalaxyOctreeObject } from '../../../@types/data/galaxyCatalog/GalaxyOctreeObject';
import type { FetchDataBytes } from '../../../@types/loading/FetchDataBytes';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeChunkRef } from '../../../@types/octree/OctreeChunkRef';
import type { GalaxyChunkPair } from '../@types/GalaxyChunkPair';
import { decodeOctreeChunk } from '../../../data/octree/decodeOctreeChunk';
import { decodeOctreeInfo } from '../../../data/octree/decodeOctreeInfo';
import { GALAXY_INFO_REQUIRED_COLUMNS } from '../../../data/octree/galaxyOctreeFamily';
import { galaxyColumnsOf } from '../../../utils/galaxy/galaxyColumnsOf';
import { octreeChunkInfoPath } from '../../../utils/octree/octreeChunkInfoPath';
import { octreeChunkPath } from '../../../utils/octree/octreeChunkPath';

const PAIRS = 16;

export function createChunkPairCache(
  name: string,
  octree: Pick<Octree<GalaxyColumns>, 'columns'>,
  residentChunk: (id: number) => GalaxyOctreeObject | null,
  fetchBytes: FetchDataBytes,
): (ref: OctreeChunkRef) => Promise<GalaxyChunkPair | null> {
  const pairs = new Map<number, Promise<GalaxyChunkPair | null>>();

  async function load(ref: OctreeChunkRef): Promise<GalaxyChunkPair | null> {
    const resident = residentChunk(ref.id);
    const [renderBuf, infoBuf] = await Promise.all([
      resident === null ? fetchBytes(octreeChunkPath('galaxy', name, ref)) : null,
      fetchBytes(octreeChunkInfoPath('galaxy', name, ref)),
    ]);
    if (infoBuf === null || (resident === null && renderBuf === null)) return null;
    let chunk = resident;
    if (chunk === null) {
      const { header, nodes, columns } = decodeOctreeChunk(renderBuf!, octree);
      chunk = { nodes, records: galaxyColumnsOf(columns, header.records) };
    }
    return { chunk, info: decodeOctreeInfo(infoBuf, GALAXY_INFO_REQUIRED_COLUMNS).columns };
  }

  return (ref) => {
    let pair = pairs.get(ref.id);
    if (pair !== undefined) {
      pairs.delete(ref.id);
    } else {
      const loading = load(ref);
      const forget = () => {
        if (pairs.get(ref.id) === loading) pairs.delete(ref.id);
      };
      loading.then((p) => p ?? forget(), forget);
      pair = loading;
    }
    pairs.set(ref.id, pair);
    if (pairs.size > PAIRS) pairs.delete(pairs.keys().next().value!);
    return pair;
  };
}
