/**
 * watchSelectionRevealSaga — a select or focus switches its subject's section on (the show entry
 * whose `selects` names the ref's kind), so a link, search hit or remote command to a hidden
 * kind shows what it names. A pending request reveals by its id's claimed kind, before the
 * layer has data to resolve it. Hover is not listened to: it never reveals. A takeover is
 * exempt: a tour's visibility is its cues', which the tour fold replays on a seek, and its exit
 * restore re-focuses after restoring the viewer's settings, which a reveal would undo. Only a
 * section switch is written: a bare key on a per-item-only cluster would turn every item on,
 * which no link means.
 */
import { getContext, put, select, takeEvery } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { updateSelectionFocus, updateSelectionSelect } from './selectionSlice';
import { requestFocus } from './requestFocus';
import { requestSelect } from './requestSelect';
import { suspendDuringClip } from './suspendDuringClip';
import { selectSettings } from '../settings/selectSettings';
import { selectTakeoverSource } from '../takeover/selectors';
import { APP_VISIBILITY_REGISTRY } from '../../compositions/appVisibility';
import { settingsClusterOf } from '../../utils/visibility/settingsClusterOf';
import { setVisibilityActionsFor } from '../../utils/visibility/setVisibilityActionsFor';
import { visibilityAddressOf } from '../../utils/visibility/visibilityAddressOf';
import { visibilityClusterOf } from '../../utils/visibility/visibilityClusterOf';
import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';
import type { SagaContext } from '../../store/types';

const ENTRIES: readonly VisibilityEntry[] = APP_VISIBILITY_REGISTRY;

function* kindOf(action: Action) {
  if (updateSelectionSelect.match(action) || updateSelectionFocus.match(action)) {
    return action.payload?.type ?? null;
  }
  const id = requestFocus.match(action)
    ? action.payload.id
    : requestSelect.match(action)
      ? action.payload
      : null;
  if (id === null) return null;
  const selection = yield* getContext<SagaContext['selection']>('selection');
  return selection.claimedKind(id);
}

export function* watchSelectionRevealSaga() {
  yield* takeEvery(
    [updateSelectionSelect, updateSelectionFocus, requestFocus, requestSelect],
    suspendDuringClip(function* (action: Action) {
      const kind: SelectionRefBase['type'] | null = yield* kindOf(action);
      const entry = kind && ENTRIES.find((e) => 'key' in e && e.selects?.includes(kind));
      if (!entry || (yield* select(selectTakeoverSource)) !== null) return;
      const settings = yield* select(selectSettings);
      if (settingsClusterOf(settings, visibilityClusterOf(entry)).enabled !== false) return;
      for (const write of setVisibilityActionsFor(settings, visibilityAddressOf(entry), true)) {
        yield* put(write);
      }
    }),
  );
}
