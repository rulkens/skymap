/**
 * selectDomeStatus — the snapshot a dome sends its remotes. Lives in
 * `compositions/` because its toggle rows come from `selectToggleRows`, which
 * reads Layers; the caller passes them in, with the dome's own `nowMs`.
 * `focus` is the URL's focus id with Earth included: the URL drops Earth as
 * home, but a remote must still see what is focused.
 */

import { selectFocusedFocusable } from '../state/selection/selectors';
import { selectTakeoverSource } from '../state/takeover/selectors';
import { selectTimeState } from '../state/time/selectors';
import { selectTourBeatIndex, selectTourPaused, selectTourTotal } from '../state/tour/selectors';
import { deriveSimDays } from '../utils/time/deriveSimDays';
import { focusIdOf } from '../utils/selection/focusIdOf';
import type { DomeStatus } from '../@types/remote/DomeStatus';
import type { ToggleRow } from '../@types/settings/ToggleRow';
import type { RootState } from '../store/types';

export function selectDomeStatus(
  state: RootState,
  toggleRows: readonly ToggleRow[],
  nowMs: number,
): DomeStatus {
  const focused = selectFocusedFocusable(state);
  const focusId = focused && focusIdOf(focused);
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
    toggles: toggleRows.map(({ id, label, enabled }) => ({ id, label, enabled })),
  };
}
