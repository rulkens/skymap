/**
 * fillRotationGrid — assemble a rotation's 72 longitude columns (0, 5, …, 355 deg). Charts
 * with gaps upstream are completed from the classic-model chart first, then from the previous
 * rotation's column at the same longitude (the field drifts slowly, so a stale column beats a hole).
 */

import type { FilledRotationGrid } from './@types/FilledRotationGrid';

const LONGITUDE_COLUMNS = 72;
const LONGITUDE_STEP_DEG = 5;

export function fillRotationGrid(
  radial: ReadonlyMap<number, number[]>,
  classic: ReadonlyMap<number, number[]>,
  previous: readonly (readonly number[])[] | null,
): FilledRotationGrid {
  let usedClassicModel = false;
  let usedPreviousRotation = false;
  const grid = Array.from({ length: LONGITUDE_COLUMNS }, (_, i) => {
    const lon = i * LONGITUDE_STEP_DEG;
    const own = radial.get(lon);
    if (own) return own;
    const fromClassic = classic.get(lon);
    if (fromClassic) {
      usedClassicModel = true;
      return fromClassic;
    }
    const carried = previous?.[i];
    if (!carried)
      throw new Error(`fillRotationGrid: no data for longitude ${lon} and no previous rotation`);
    usedPreviousRotation = true;
    return [...carried];
  });
  return { grid, usedClassicModel, usedPreviousRotation };
}
