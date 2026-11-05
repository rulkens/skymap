/**
 * selectDomeStatus — the snapshot a dome sends its remotes. The
 * caller passes the toggle and Layer rows in, with the dome's own `nowMs`.
 * `focus` is named from the focus row, as its info card names it. The
 * exhibit's `entry` stays home: the remote shows what runs, not how it arrived.
 */

import { selectCameraControls } from '../settings/selectors';
import { selectFocusedFocusable } from '../selection/focusableSelectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectTimeState } from '../time/selectors';
import { selectTourBeatIndex, selectTourPaused, selectTourTotal } from '../tour/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { selectionKindOf } from '../../compositions/selectionKindOf';
import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { RemoteTakeover } from '../../@types/remote/RemoteTakeover';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';
import type { ToggleRow } from '../../@types/settings/ToggleRow';
import type { RootState } from '../../store/types';

/** The exhibit's `entry` stays home; the clip source already has the remote's shape, so a new kind fails to compile here. */
function remoteTakeover(source: TakeoverSource, state: RootState): RemoteTakeover {
  if (source.kind === 'tour') {
    return {
      kind: 'tour',
      id: source.id,
      beatIndex: selectTourBeatIndex(state),
      beatCount: selectTourTotal(state),
      paused: selectTourPaused(state),
    };
  }
  return source.kind === 'exhibit' ? { kind: 'exhibit', id: source.id } : source;
}

export function selectDomeStatus(
  state: RootState,
  toggleRows: readonly ToggleRow[],
  switchRows: readonly ToggleRow[],
  nowMs: number,
): DomeStatus {
  const focused = selectFocusedFocusable(state);
  const takeover = selectTakeoverSource(state);
  const time = selectTimeState(state);
  return {
    focus: focused ? { name: selectionKindOf(focused.type).displayName(focused) } : null,
    takeover: takeover ? remoteTakeover(takeover, state) : null,
    time: {
      simDays: deriveSimDays(time, nowMs),
      rateIndex: time.rateIndex,
      direction: time.direction,
      paused: time.paused,
      mode: time.mode,
    },
    controls: { scheme: selectCameraControls(state).scheme },
    toggles: toggleRows.map(({ id, label, enabled }) => ({ id, label, enabled })),
    layers: switchRows.map(({ id, label, enabled }) => ({ id, label, enabled })),
  };
}
