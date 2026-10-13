// Append-only: a baked file names its columns by these ids, so a rename or reuse misreads old files.
import type { ColumnId } from '../../@types/octree/ColumnId';
import type { OctreeFamily } from '../../@types/octree/OctreeFamily';

export const COLUMN_IDS = ['offset', 'absMag', 'colourIndex'] as const;

export const FAMILY_REQUIRED_COLUMNS: Readonly<Record<OctreeFamily, readonly ColumnId[]>> = {
  star: ['offset', 'absMag', 'colourIndex'],
};
