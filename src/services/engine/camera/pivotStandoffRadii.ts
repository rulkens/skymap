/**
 * pivotStandoffRadii — the per-focus override of `clampDistance`'s global
 * `SURFACE_STANDOFF_RADII`, read the same way `pivotRadiusMpc` reads the pivot
 * radius: off a resolved `SelectionRow`'s 'body' arm (`AnchorPointBody.
 * standoffRadii`, e.g. Sgr A*'s Q10 floor of 2 r_s). Every other row —
 * including a survey star, which has no per-record override field — falls
 * through to the global ratio, so this is a sibling read, not a branch on
 * `pivotRadiusMpc`'s own result.
 */

import { SURFACE_STANDOFF_RADII } from '../../../utils/camera/clampDistance';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';

export function pivotStandoffRadii(row: SelectionRow | null): number {
  if (row === null || row.type !== 'body') return SURFACE_STANDOFF_RADII;
  return row.standoffRadii ?? SURFACE_STANDOFF_RADII;
}
