/** Where a focus id's object sits at `simDays`, world Mpc; null until its catalog row is loaded. */
import type { PlacedRow } from '../../../../../src/@types/engine/selection/PlacedRow';
import type { SelectionResolver } from '../../../../../src/@types/engine/selection/SelectionResolver';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

export function focusPosition(
  selection: SelectionResolver,
  id: string,
  simDays: number,
): Vec3 | null {
  const row = selection.extractRow(selection.resolveFocusId(id), simDays) as PlacedRow | null;
  return row?.positionMpc ?? null;
}
