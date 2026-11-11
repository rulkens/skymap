/**
 * What a key does to the studio, as the actions to dispatch, or null when it has nothing to do
 * (nothing to undo, a leaf row to fold), so the key keeps its default. Escape clears the selection
 * first and then closes the studio: the app's own Escape stands down while the studio is open.
 * `help` is the overlay's, not the store's, so it is not here. Folding acts on the visible row that
 * stands for the selection, the same one the outline highlights. The transport buttons dispatch
 * through here too, so a key and its button cannot disagree. Play waits for the preview to start.
 */
import {
  followResumed,
  loopToggled,
  paused,
  played,
  playheadSet,
  redone,
  viewportSet,
  rowSelected,
  rowToggled,
  undone,
} from '../../session/state/studioSlice';
import {
  selectLoop,
  selectPlayheadSec,
  selectRedoLabel,
  selectSelection,
  selectTransport,
  selectUndoLabel,
  selectViewport,
} from '../../session/state/selectors';
import { selectSelectedRow } from '../../timeline/state/selectSelectedRow';
import { playFrom } from '../../session/utils/playFrom';
import { loopSpanOf } from '../../session/utils/loopSpanOf';
import { selectClipActive } from '../../../../../src/state/camera/selectors';
import { ZOOM_FACTOR } from '../../timeline/data/zoom';
import { zoomedViewport } from '../../timeline/utils/window/zoomedViewport';
import { selectSelectionStandInId } from '../../timeline/state/selectSelectionStandInId';
import { selectTimeline } from '../../timeline/state/selectTimeline';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../../../../src/store/types';
import type { StudioKeyId } from '../@types/StudioKeyId';

export function runStudioKey(id: StudioKeyId, state: RootState): UnknownAction[] | null {
  if (id === 'escape')
    return selectSelection(state) === null ? [exitTakeover()] : [rowSelected(null)];
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
    case 'end': {
      if (timeline.durationSec === null) return null;
      const end = playheadSet(timeline.durationSec);
      return selectTransport(state).kind === 'running' ? [paused(), end] : [end];
    }
    case 'play': {
      if (selectTransport(state).kind === 'running') return [paused()];
      if (!selectClipActive(state)) return null;
      const loop = selectLoop(state) ? loopSpanOf(selectSelectedRow(state), timeline) : null;
      const head = selectPlayheadSec(state);
      return [played({ fromSec: playFrom(head, timeline.durationSec ?? Infinity, loop), loop })];
    }
    case 'loop': {
      if (selectTransport(state).kind !== 'running') return [loopToggled()];
      // The span is read at the press (Q-I): pressing L twice takes the selection anew.
      const loop = selectLoop(state) ? null : loopSpanOf(selectSelectedRow(state), timeline);
      const head = selectPlayheadSec(state);
      const fromSec = playFrom(head, timeline.durationSec ?? Infinity, loop);
      return [loopToggled(), played({ fromSec, loop })];
    }
    case 'follow': {
      const transport = selectTransport(state);
      return transport.kind === 'paused' && transport.camera === 'free' ? [followResumed()] : null;
    }
    case 'zoomIn':
    case 'zoomOut': {
      if (timeline.durationSec === null) return null;
      const factor = id === 'zoomIn' ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
      const next = zoomedViewport(
        selectViewport(state),
        timeline,
        factor,
        selectPlayheadSec(state),
      );
      return [viewportSet(next)];
    }
    case 'help':
      return null;
  }
}
