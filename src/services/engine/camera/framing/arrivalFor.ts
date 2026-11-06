/**
 * arrivalFor — the arrival framing for any row: its kind's focus facts, then `arrivalFraming`.
 * The one place a row is read as placed: `SelectionKindFacts` only lets a kind with a focus
 * declare placed rows, so the cast holds wherever the focus is non-null.
 */

import { arrivalFraming } from './arrivalFraming';
import { selectionKindOf } from '../../selection/selectionKindOf';
import type { FocusFraming } from '../../../../@types/camera/pose/FocusFraming';
import type { PlacedRow } from '../../../../@types/engine/selection/PlacedRow';
import type { SelectionRowBase } from '../../../../@types/engine/selection/SelectionRowBase';

export function arrivalFor(row: SelectionRowBase, fovYRad: number): FocusFraming {
  const { focus } = selectionKindOf(row.type);
  if (focus === null) throw new Error(`arrivalFor: a ${row.type} row has no focus target`);
  return arrivalFraming(row as PlacedRow, focus, fovYRad);
}
