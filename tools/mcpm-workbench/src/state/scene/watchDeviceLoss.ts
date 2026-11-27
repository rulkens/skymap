import { call, put } from 'typed-redux-saga';

import type { GpuContext } from '../../../../../packages/shared/src/@types/rendering/GpuContext';
import type { RenderResources } from '../../../@types/render/RenderResources';
import { deviceLost } from '../view/viewSlice';

/**
 * Watches the device this specific build acquired. Detached (`spawn`, not
 * `fork`): a `fork`ed child is cancelled along with its parent, but this must
 * outlive the worker that started it — the device it watches often keeps
 * rendering for many rebuilds after this call returns. The `resources.gpu`
 * staleness check is the same guard Viewport's old `currentDevice` variable
 * gave: a device abandoned by a later rebuild (never explicitly destroyed,
 * same as before) can still independently be lost, and that must not clobber
 * the CURRENT device's status. With `destroyed` filtered out, the only reason
 * left is `unknown`, so the store keeps a flag, not the reason.
 */
export function* watchDeviceLoss(resources: RenderResources, gpu: GpuContext) {
  const info = yield* call(() => gpu.device.lost);
  if (resources.gpu?.device !== gpu.device || info.reason === 'destroyed') return;
  yield* put(deviceLost());
}
