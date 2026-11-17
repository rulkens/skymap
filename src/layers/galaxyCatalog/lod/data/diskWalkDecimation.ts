/**
 * DISK_WALK_DECIMATION — the disk walk visits 1/N of each catalog block per frame, so a row
 * is revisited once every N frames; the textured planner holds atlas slots that long.
 */
export const DISK_WALK_DECIMATION = 8;
