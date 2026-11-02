/**
 * selectDomeStatus — the snapshot a dome sends its remotes. The
 * caller passes the toggle rows in, with the dome's own `nowMs`.
 * `focus` is the URL's focus id with Earth included: the URL drops Earth as
 * home, but a remote must still see what is focused.
 */

import { selectCameraControls } from '../settings/selectors';
import { selectFocusId } from '../selection/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectTimeState } from '../time/selectors';
import { selectTourBeatIndex, selectTourPaused, selectTourTotal } from '../tour/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { ToggleRow } from '../../@types/settings/ToggleRow';
import type { RootState } from '../../store/types';

export function selectDomeStatus(
  state: RootState,
  toggleRows: readonly ToggleRow[],
  nowMs: number,
): DomeStatus {
  const focusId = selectFocusId(state);
  const takeover = selectTakeoverSource(state);
  const time = selectTimeState(state);
  return {
    focus: focusId ? { id: focusId } : null,
    tour:
      takeover?.kind === 'tour'
        ? {
            id: takeover.id,
            beatIndex: selectTourBeatIndex(state),
            beatCount: selectTourTotal(state),
            paused: selectTourPaused(state),
          }
        : null,
    time: {
      simDays: deriveSimDays(time, nowMs),
      rateIndex: time.rateIndex,
      direction: time.direction,
      paused: time.paused,
      mode: time.mode,
    },
    controls: { scheme: selectCameraControls(state).scheme },
    toggles: toggleRows.map(({ id, label, enabled }) => ({ id, label, enabled })),
  };
}
