/**
 * clockToFocusInstantSaga — a body focused while absent moves the clock to its row's `focusIso`
 * (owner ruling 2026-11-25, 2026 QQ8). Absence is judged on the loaded track, so one still in
 * flight is waited for and one that never loads leaves the clock alone. `setSimDays` keeps the
 * clock paused or running as it was, so a `t=` link stays paused.
 */
import { put, select, take } from 'typed-redux-saga';

import { setSimDays } from '../time/timeSlice';
import { selectTimeState } from '../time/selectors';
import { selectFocusRef } from './selectors';
import { sampledTracksSettled } from '../../services/bodies/sampledTracksSettled';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { SAMPLED_BODIES } from '../../data/bodies/sampledBodies';
import { bodyPresent } from '../../utils/scene/bodyPresent';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { isoToJulianDays } from '../../utils/time/isoToJulianDays';
import { isKind } from '../../utils/selection/isKind';
import { refKey } from '../../utils/selection/refKey';
import type { BodyRef } from '../../@types/engine/selection/BodyRef';
import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';

const FOCUS_DAYS = new Map<string, number>(
  SAMPLED_BODIES.flatMap(({ id, focusIso }) =>
    focusIso === undefined ? [] : [[id, isoToJulianDays(focusIso)]],
  ),
);

export function* clockToFocusInstantSaga(ref: SelectionRefBase) {
  if (!isKind<BodyRef>(ref, 'body')) return;
  const focusDays = FOCUS_DAYS.get(ref.id);
  if (focusDays === undefined) return;
  while (trajectoryRegistry.get(ref.id) === undefined) {
    const { payload } = yield* take(sampledTracksSettled);
    if (payload.ids.includes(ref.id)) break;
  }
  if (trajectoryRegistry.get(ref.id) === undefined) return;
  // The visitor may have focused something else while the track loaded.
  const focus = yield* select(selectFocusRef);
  if (focus === null || refKey(focus) !== refKey(ref)) return;
  const nowMs = performance.now();
  if (bodyPresent(ref.id, deriveSimDays(yield* select(selectTimeState), nowMs))) return;
  yield* put(setSimDays({ simDays: focusDays, nowMs }));
}
