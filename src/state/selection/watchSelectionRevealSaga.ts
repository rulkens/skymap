/**
 * watchSelectionRevealSaga — a select or focus switches its subject's section on (the show entry
 * whose `selects` names the ref's kind), so a link, search hit or remote command to a hidden
 * kind shows what it names. Hover is not listened to: it never reveals. A takeover is exempt: a
 * tour's visibility is its cues', which the tour fold replays on a seek, and its exit restore
 * re-focuses after restoring the viewer's settings, which a reveal would undo. Only a section
 * switch is written: a bare key on a per-item-only cluster would turn every item on, which no
 * link means.
 */
import { put, select, takeEvery } from 'typed-redux-saga';
import type { PayloadAction } from '@reduxjs/toolkit';

import { updateSelectionFocus, updateSelectionSelect } from './selectionSlice';
import { suspendDuringClip } from './suspendDuringClip';
import { selectSettings } from '../settings/selectSettings';
import { selectTakeoverSource } from '../takeover/selectors';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { settingsClusterOf } from '../../utils/visibility/settingsClusterOf';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';
import { visibilityAddressOf } from '../../utils/visibility/visibilityAddressOf';
import { visibilityClusterOf } from '../../utils/visibility/visibilityClusterOf';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;

export function* watchSelectionRevealSaga() {
  yield* takeEvery(
    [updateSelectionSelect, updateSelectionFocus],
    suspendDuringClip(function* (action: PayloadAction<SelectionRef | null>) {
      const ref = action.payload;
      const entry = ref && ENTRIES.find((e) => 'key' in e && e.selects?.includes(ref.type));
      if (!entry || (yield* select(selectTakeoverSource)) !== null) return;
      const settings = yield* select(selectSettings);
      if (settingsClusterOf(settings, visibilityClusterOf(entry)).enabled !== false) return;
      for (const write of setVisibilityActionsFor(settings, visibilityAddressOf(entry), true)) {
        yield* put(write);
      }
    }),
  );
}
