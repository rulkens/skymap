import type { DecodedOctreeObject } from '../../@types/octree/DecodedOctreeObject';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import { FAMILY_REQUIRED_COLUMNS } from './columnIds';
import { decodeOctreeBody } from './decodeOctreeBody';
import { OCTREE_INDEX_MAGIC } from './octreeFormat';
import { readOctreeHeader } from './readOctreeHeader';

export function decodeOctreeIndex(buf: ArrayBuffer): DecodedOctreeObject<OctreeIndexHeader> {
  const { header, nodeTableOffset } = readOctreeHeader<OctreeIndexHeader>(buf, OCTREE_INDEX_MAGIC);
  const declared = new Set(header.columns.map((c) => c.id));
  const missing = FAMILY_REQUIRED_COLUMNS[header.family].filter((id) => !declared.has(id));
  if (missing.length > 0) {
    throw new Error(
      `octree index of family '${header.family}' lacks required column(s): ${missing.join(', ')}`,
    );
  }
  return { header, ...decodeOctreeBody(buf, nodeTableOffset, header, header.columns) };
}
