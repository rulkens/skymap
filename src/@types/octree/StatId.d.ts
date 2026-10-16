import type { STAT_IDS } from '../../data/octree/statIds';

/** A catalog-wide statistic the index header carries; append-only like `ColumnId`. */
export type StatId = (typeof STAT_IDS)[number];
