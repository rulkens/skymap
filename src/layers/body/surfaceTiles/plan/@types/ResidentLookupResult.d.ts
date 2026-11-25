import type { Vec2 } from '../../../../../@types/math/Vec2';

/**
 * ResidentLookupResult — what `SurfaceTileResidency.residentSlot` answers for
 * one exact tile: its atlas slot and rect, or null when it is not resident.
 */
export type ResidentLookupResult = {
  readonly slot: number;
  readonly atlasUvOrigin: Readonly<Vec2>;
  readonly atlasUvScale: Readonly<Vec2>;
  readonly readyAtMs: number;
  /** HEIGHT only: the tile header's `subtreeMin/MaxM`, which bound every
   *  descendant of that tile. Absent or null is read as "no bound known",
   *  which is the datum — never an assumption of flat ground. */
  readonly subtreeRangeM?: readonly [number, number] | null;
} | null;
