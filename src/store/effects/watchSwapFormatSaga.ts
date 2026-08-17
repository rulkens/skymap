/**
 * watchSwapFormatSaga — applies the display-driven swap-chain format on both
 * `setHdrEnabled` and `engineHdrCapabilityChanged`: capability can drop with
 * the setting untouched (an SDR-monitor move) — a settings-only watch misses it.
 *
 * No payload guard, unlike the model `watchFlowReseedSaga`: both triggers are
 * meaningful, and the no-op-if-unchanged guard already lives in
 * `applySwapFormat`, which sees the live format.
 */

import { takeEvery, getContext, select } from 'typed-redux-saga';

import { setHdrEnabled } from '../../state/settings/settingsSlice';
import { engineHdrCapabilityChanged } from '../../state/engine/engineSlice';
import { selectHdrEnabled } from '../../state/settings/selectors';
import { selectHdrCapable } from '../../state/engine/selectors';
import type { ReconcileEffects } from './ReconcileEffects';

function* applyDesiredSwapFormat() {
  const hdrCapable = yield* select(selectHdrCapable);
  const enabled = yield* select(selectHdrEnabled);
  const desired: GPUTextureFormat =
    hdrCapable && enabled ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat();

  const fx = yield* getContext<ReconcileEffects>('reconcile');
  fx.applySwapFormat(desired);
}

export function* watchSwapFormatSaga() {
  yield* takeEvery(setHdrEnabled, applyDesiredSwapFormat);
  yield* takeEvery(engineHdrCapabilityChanged, applyDesiredSwapFormat);
}
