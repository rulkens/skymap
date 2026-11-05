import type { ColumnId } from '../../@types/octree/ColumnId';
import type { OctreeColumn } from '../../@types/octree/OctreeColumn';
import type { OctreeInfoHeader } from '../../@types/octree/OctreeInfoHeader';
import { decodeOctreeBody } from './decodeOctreeBody';
import { OCTREE_INFO_MAGIC } from './octreeFormat';
import { readOctreeHeader } from './readOctreeHeader';

/** An info object decodes against its own header's columns; `required` is what the caller will read. */
export function decodeOctreeInfo(
  buf: ArrayBuffer,
  required: readonly ColumnId[],
): { header: OctreeInfoHeader; columns: ReadonlyMap<ColumnId, OctreeColumn> } {
  const { header, nodeTableOffset } = readOctreeHeader<OctreeInfoHeader>(buf, OCTREE_INFO_MAGIC);
  const declared = new Set(header.columns.map((c) => c.id));
  const missing = required.filter((id) => !declared.has(id));
  if (missing.length > 0) {
    throw new Error(`octree info object lacks required column(s): ${missing.join(', ')}`);
  }
  const counts = { nodes: 0, records: header.records };
  return { header, columns: decodeOctreeBody(buf, nodeTableOffset, counts, header.columns).columns };
}
