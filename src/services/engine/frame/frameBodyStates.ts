/**
 * frameBodyStates — the body snapshot a frame context is built on: `deriveBodyStates` at the
 * instant, surface sites seated by their debug offsets, with the moving select/focus placed in it.
 * The one recipe `runFrame` and the pick path share; a cubemap capture takes its frame's Map
 * instead, so the selection is placed once a frame.
 */
import type { BodyState } from '../../../@types/scene/BodyState';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SelectionState } from '../../../@types/store/SelectionState';
import type { SelectionRowsState } from '../../../@types/store/SelectionRowsState';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import type { DebugSettings } from '../../../@types/settings/DebugSettings';
import { deriveBodyStates } from './deriveBodyStates';
import { seatSurfaceSites } from './seatSurfaceSites';
import { placeLiveSelection } from './placeLiveSelection';

export function frameBodyStates(
  stored: {
    readonly selection: SelectionState;
    readonly selectionRows: SelectionRowsState;
    readonly settings: { readonly debug: Pick<DebugSettings, 'siteSeatOffsetsM'> };
  },
  kindRows: readonly SelectionKindRow[],
  simDays: number,
): ReadonlyMap<PositionedId, BodyState> {
  const { selection, selectionRows, settings } = stored;
  return placeLiveSelection(
    seatSurfaceSites(deriveBodyStates(simDays), settings.debug.siteSeatOffsetsM),
    [
      { ref: selection.select, row: selectionRows.select },
      { ref: selection.focus, row: selectionRows.focus },
    ],
    kindRows,
    simDays,
  );
}
