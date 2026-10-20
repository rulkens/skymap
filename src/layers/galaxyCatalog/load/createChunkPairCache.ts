/**
 * createChunkPairCache — a galaxy chunk's render and info objects fetched by ref for a
 * lookup (a row, a position descent), kept apart from the render pool so a lookup never
 * takes a slot from what is drawn. LRU by insertion order of a `Map`: a hit re-inserts.
 */
import type { GalaxyColumns } from '../../../@types/data/galaxyCatalog/GalaxyColumns';
import type { Octree } from '../../../@types/octree/Octree';
import type { OctreeChunkRef } from '../../../@types/octree/OctreeChunkRef';
import type { GalaxyChunkPair } from '../@types/GalaxyChunkPair';
import type { GalaxyChunkPairCache } from '../@types/GalaxyChunkPairCache';
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
  fetchBytes: (path: string) => Promise<ArrayBuffer | null>,
): GalaxyChunkPairCache {
  const pairs = new Map<number, Promise<GalaxyChunkPair | null>>();

  async function load(ref: OctreeChunkRef): Promise<GalaxyChunkPair | null> {
    const [renderBuf, infoBuf] = await Promise.all([
      fetchBytes(octreeChunkPath('galaxy', name, ref)),
      fetchBytes(octreeChunkInfoPath('galaxy', name, ref)),
    ]);
    if (renderBuf === null || infoBuf === null) {
      pairs.delete(ref.id);
      return null;
    }
    const { header, nodes, columns } = decodeOctreeChunk(renderBuf, octree);
    return {
      chunk: {
        ref,
        nodes,
        records: galaxyColumnsOf(columns, header.records),
        chunks: header.chunks,
      },
      info: decodeOctreeInfo(infoBuf, GALAXY_INFO_REQUIRED_COLUMNS).columns,
    };
  }

  return {
    get(ref) {
      let pair = pairs.get(ref.id);
      if (pair !== undefined) pairs.delete(ref.id);
      else pair = load(ref);
      pairs.set(ref.id, pair);
      if (pairs.size > PAIRS) pairs.delete(pairs.keys().next().value!);
      return pair;
    },
  };
}
