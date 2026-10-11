import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { OctreeChunkHeader } from '../../@types/octree/OctreeChunkHeader';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import { decodeOctreeBody } from './decodeOctreeBody';
import { OCTREE_CHUNK_MAGIC } from './octreeFormat';
import { readOctreeHeader } from './readOctreeHeader';

/** A chunk carries no schema: its columns are the ones its index declares, in that order. */
export function decodeOctreeChunk(
  buf: ArrayBuffer,
  index: Pick<OctreeIndexHeader, 'columns'>,
): DecodedOctreeObject<OctreeChunkHeader> {
  const { header, nodeTableOffset } = readOctreeHeader<OctreeChunkHeader>(buf, OCTREE_CHUNK_MAGIC);
  return { header, ...decodeOctreeBody(buf, nodeTableOffset, header, index.columns) };
}
