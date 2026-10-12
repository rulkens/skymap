/**
 * mergeHorizonsChunks — concatenate per-chunk Horizons rows into one strictly increasing
 * series. Adjacent chunks share their boundary instant (each query is inclusive at both
 * ends), so a row whose `jd` is not past the previous row's is dropped.
 */

import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';

export function mergeHorizonsChunks(
  chunks: readonly (readonly HorizonsVectorRow[])[],
): HorizonsVectorRow[] {
  const merged: HorizonsVectorRow[] = [];
  for (const row of chunks.flat()) {
    const last = merged.at(-1);
    if (!last || row.jd > last.jd) merged.push(row);
  }
  return merged;
}
