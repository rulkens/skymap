// Append-only: a baked file names its columns by these ids, so a rename or reuse misreads old files.
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { OctreeFamily } from '../../@types/octree/OctreeFamily';

export const COLUMN_IDS = [
  'offset',
  'absMag',
  'colourIndex',
  'axisRatio',
  'pa',
  'logSize',
  'flags',
  'angularWeight',
  'specZ',
  'logMass',
  'magU',
  'magG',
  'magR',
  'magI',
  'magZ',
  'objId',
  'ordinal',
] as const;

/** Render columns an index must declare; info columns are checked by `decodeOctreeInfo`'s caller. */
export const FAMILY_REQUIRED_COLUMNS: Readonly<Record<OctreeFamily, readonly ColumnId[]>> = {
  star: ['offset', 'absMag', 'colourIndex'],
  galaxy: ['offset', 'absMag', 'colourIndex', 'axisRatio', 'pa', 'logSize', 'flags', 'angularWeight'],
};
