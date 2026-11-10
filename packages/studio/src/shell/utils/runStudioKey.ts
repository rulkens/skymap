/**
 * What a key does to the studio, as the actions to dispatch, or null when it has nothing to do
 * (nothing to undo, no selection to clear, a leaf row to fold), so the event is left for the app.
 * `help` is the overlay's, not the store's, so it is not here. Folding acts on the visible row that
 * stands for the selection, the same one the outline highlights.
 */
import {
  playheadSet,
  redone,
  rowSelected,
  rowToggled,
  undone,
} from '../../session/state/studioSlice';
import { selectSelection, selectRedoLabel, selectUndoLabel } from '../../session/state/selectors';
import { selectSelectionStandInId } from '../../timeline/state/selectSelectionStandInId';
import { selectTimeline } from '../../timeline/state/selectTimeline';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../../../../src/store/types';
import type { StudioKeyId } from '../@types/StudioKeyId';

export function runStudioKey(id: StudioKeyId, state: RootState): UnknownAction[] | null {
  const timeline = selectTimeline(state);
  if (timeline === null) return null;
  const standIn = selectSelectionStandInId(state);
  const at = timeline.rows.findIndex((row) => row.id === standIn);
  switch (id) {
    case 'previous':
    case 'next': {
      const to =
        at === -1 ? (id === 'next' ? 0 : timeline.rows.length - 1) : at + (id === 'next' ? 1 : -1);
      const row = timeline.rows[to];
      // The ends swallow the key too: an arrow must not scroll the page behind the dock.
      return row === undefined || to === at ? [] : [rowSelected(row.ref)];
    }
    case 'fold':
    case 'unfold': {
      const row = timeline.rows[at];
      return row?.expandable === true && row.collapsed === (id === 'unfold')
        ? [rowToggled(row.id)]
        : null;
    }
    case 'undo':
      return selectUndoLabel(state) === null ? null : [undone()];
    case 'redo':
      return selectRedoLabel(state) === null ? null : [redone()];
    case 'start':
      return [playheadSet(0)];
    case 'end':
      return timeline.durationSec === null ? null : [playheadSet(timeline.durationSec)];
    case 'clear':
      return selectSelection(state) === null ? null : [rowSelected(null)];
    case 'help':
      return null;
  }
}
