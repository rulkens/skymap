/**
 * selectDomeStatus — the snapshot a dome sends its remotes. The
 * caller passes the toggle and Layer rows in, with the dome's own `nowMs`.
 * `focus` is named from the focus row, as its info card names it. The
 * exhibit's `entry` stays home: the remote shows what runs, not how it arrived.
 */

import { selectCameraControls } from '../settings/selectors';
import { selectFocusedFocusable } from '../selection/selectors';
import { selectTakeoverSource } from '../takeover/selectors';
import { selectTimeState } from '../time/selectors';
import { selectTourBeatIndex, selectTourPaused, selectTourTotal } from '../tour/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { TARGET_NAME } from '../../services/engine/helpers/targetName';
import type { DomeStatus } from '../../@types/remote/DomeStatus';
import type { RemoteTakeover } from '../../@types/remote/RemoteTakeover';
import type { TakeoverSource } from '../../@types/takeover/TakeoverSource';
import type { ToggleRow } from '../../@types/settings/ToggleRow';
import type { RootState } from '../../store/types';

const REMOTE_TAKEOVER: {
  [K in TakeoverSource['kind']]: (
    source: Extract<TakeoverSource, { kind: K }>,
    state: RootState,
  ) => RemoteTakeover;
} = {
  tour: ({ kind, id }, state) => ({
    kind,
    id,
    beatIndex: selectTourBeatIndex(state),
    beatCount: selectTourTotal(state),
    paused: selectTourPaused(state),
  }),
  exhibit: ({ kind, id }) => ({ kind, id }),
  clip: ({ kind, id }) => ({ kind, id }),
};

export function selectDomeStatus(
  state: RootState,
  toggleRows: readonly ToggleRow[],
  layerRows: readonly ToggleRow[],
  nowMs: number,
): DomeStatus {
  const focused = selectFocusedFocusable(state);
  const takeover = selectTakeoverSource(state);
  const time = selectTimeState(state);
  return {
    focus: focused ? { name: TARGET_NAME[focused.type](focused) } : null,
    takeover: takeover
      ? (REMOTE_TAKEOVER[takeover.kind] as (s: TakeoverSource, r: RootState) => RemoteTakeover)(
          takeover,
          state,
        )
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
    layers: layerRows.map(({ id, label, enabled }) => ({ id, label, enabled })),
  };
}
