/**
 * watchFadesSaga — drive the intent→fade bridge off settings writes. Two arms:
 *
 *   1. Per-leaf writes in FADE_ROW → fade the one affected layer.
 *   2. `mergeSnapshot` (a bulk settings write) → fade EVERY row.
 *
 * FADE_ROW (imported from visibilityActionRow.ts, derived from its `writes`
 * field) is the flat 1:1 action→VisibilityLayerKey registry that replaces a
 * chain of near-identical setter bodies (simplicity.md §7 — data-table, not
 * a branch chain). Adding a new fade-triggering layer is one `writes` entry
 * in VISIBILITY_ACTION_ROW; this saga never changes.
 *
 * The `mergeSnapshot` arm is why a tour scene-restore needs NO restore-specific
 * engine effect: `restoreSceneSaga` simply `put`s `mergeSnapshot(settings)`, and
 * this arm reacts by re-fading every layer to the restored intent — the same
 * "settings write → fade" rule the per-leaf arm applies, just over the whole set.
 * `mergeSnapshot` is the only bulk write, so a full pass (`syncFades()` with no
 * rows) is the right scope; the bridge's no-op-if-unchanged guard makes re-fading
 * untouched rows free.
 *
 * The worker reaches the engine via getContext — the ReconcileEffects closure
 * registered by the engine after construction. This keeps the store layer free
 * of engine imports while still letting the saga trigger the fade effect.
 * (visibilityActionRow.ts imports only @types + settingsSlice, no engine/GPU,
 * so that constraint holds for this import too.)
 */

import { takeEvery, getContext } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { mergeSnapshot } from '../../state/settings/settingsSlice';
import { FADE_ROW } from '../../services/animation/visibilityActionRow';
import type { ReconcileEffects } from './ReconcileEffects';

export function* watchFadesSaga() {
  // Arm 1 — per-leaf writes: fade the single affected layer.
  yield* takeEvery(
    (a: Action) => a.type in FADE_ROW,
    function* (action: Action) {
      const fx = yield* getContext<ReconcileEffects>('reconcile');
      fx.syncFades([FADE_ROW[action.type]!]);
    },
  );

  // Arm 2 — bulk restore: a mergeSnapshot re-fades every row to the merged intent.
  yield* takeEvery(mergeSnapshot, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.syncFades();
  });
}
