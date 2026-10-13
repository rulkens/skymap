import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { OctreeColumn } from '../../@types/octree/OctreeColumn';

/** The star family's three required columns, narrowed to the stores `STAR_COLUMN_SCHEMA` declares. */
export function starColumnsOf(
  columns: ReadonlyMap<ColumnId, OctreeColumn>,
  count: number,
): StarColumns {
  const offset = columns.get('offset');
  const absMag = columns.get('absMag');
  const colourIndex = columns.get('colourIndex');
  if (
    !(offset instanceof Uint16Array) ||
    !(absMag instanceof Float32Array) ||
    !(colourIndex instanceof Float32Array)
  ) {
    throw new Error('star octree object: offset must be u16x3, absMag and colourIndex scalar');
  }
  return { count, offset, absMag, colourIndex };
}
