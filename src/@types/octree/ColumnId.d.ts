import type { COLUMN_IDS } from '../../data/octree/columnIds';

/** A record column's registry id; append-only, never renamed or reused (files name columns by it). */
export type ColumnId = (typeof COLUMN_IDS)[number];
