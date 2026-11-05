import type { GalaxyColumns } from '../../@types/data/galaxyCatalog/GalaxyColumns';
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { OctreeColumn } from '../../@types/octree/OctreeColumn';

/** The galaxy family's render columns, narrowed to the stores `GALAXY_COLUMN_SCHEMA` declares. */
export function galaxyColumnsOf(
  columns: ReadonlyMap<ColumnId, OctreeColumn>,
  count: number,
): GalaxyColumns {
  const offset = columns.get('offset');
  if (!(offset instanceof Uint16Array)) {
    throw new Error('galaxy octree object: offset must be u16x3');
  }
  const scalar = (id: ColumnId): Float32Array => {
    const c = columns.get(id);
    if (!(c instanceof Float32Array)) throw new Error(`galaxy octree object: ${id} must be scalar`);
    return c;
  };
  return {
    count,
    offset,
    absMag: scalar('absMag'),
    colourIndex: scalar('colourIndex'),
    axisRatio: scalar('axisRatio'),
    pa: scalar('pa'),
    logSize: scalar('logSize'),
    flags: scalar('flags'),
    angularWeight: scalar('angularWeight'),
  };
}
