/**
 * frameBodyStates — the body snapshot a frame context is built on: `deriveBodyStates` at the
 * instant, with the moving select/focus placed in it. The one recipe `runFrame`, the pick path and
 * a cubemap capture share, so a followed satellite is in every snapshot they hand out.
 */
import type { BodyState } from '../../../@types/scene/BodyState';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SelectionState } from '../../../@types/store/SelectionState';
import type { SelectionRowsState } from '../../../@types/store/SelectionRowsState';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import { deriveBodyStates } from './deriveBodyStates';
import { placeLiveSelection } from './placeLiveSelection';

export function frameBodyStates(
  stored: { readonly selection: SelectionState; readonly selectionRows: SelectionRowsState },
  kindRows: readonly SelectionKindRow[],
  simDays: number,
): ReadonlyMap<PositionedId, BodyState> {
  const { selection, selectionRows } = stored;
  return placeLiveSelection(
    deriveBodyStates(simDays),
    [
      { ref: selection.select, row: selectionRows.select },
      { ref: selection.focus, row: selectionRows.focus },
    ],
    kindRows,
    simDays,
  );
}
