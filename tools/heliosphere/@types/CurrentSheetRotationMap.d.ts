/**
 * CurrentSheetRotationMap — one Carrington rotation of the WSO source-surface field, as the
 * current-sheet render spike's `hcs.js` carries it.
 */

export type CurrentSheetRotationMap = {
  readonly cr: number;
  /** Rotation start, days since the Unix epoch (UTC). */
  readonly t: number;
  /** 72 longitude columns (0, 5, …, 355 deg) of 30 field values (µT), north to south. */
  readonly g: readonly (readonly number[])[];
};
