/**
 * watchSplatSortSaga — re-sorts every splat asset's GPU `order` buffer
 * far→near at each gesture-boundary camera commit and whenever a splat lands.
 * No staleness guard: the sort is synchronous, so nothing can run between
 * reading `positionsM` and its `writeBuffer`. An asset a group switch disposed
 * is simply absent from `gpuAssets` by the time this reads the map.
 */
import { getContext, put, select, takeLatest } from 'typed-redux-saga';

import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { sceneCameraView } from '../../render/sceneCameraView';
import { sortSplatOrder } from '../../scene/sortSplatOrder';
import type { SceneSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { assetStatusChanged } from '../group/groupSlice';
import { commitCameraPose } from '../view/viewSlice';
import { splatOrderWritten } from '../commands';

/** Eye and forward are pose-only — the viewport size never reaches them. */
const ANY_VIEWPORT_PX = [1, 1] as const;

function* sortSplatsWorker(
  action: ReturnType<typeof commitCameraPose> | ReturnType<typeof assetStatusChanged>,
) {
  if (assetStatusChanged.match(action)) {
    const { assetId, status } = action.payload;
    if (status !== 'ready') return;
    const kind = yield* select(
      (state: RootState) =>
        state.group.manifest?.assets.find((asset) => asset.id === assetId)?.kind,
    );
    if (kind !== 'gaussianSplat') return;
  }

  const resources = yield* getContext<SceneSagaContext['resources']>('resources');
  if (!resources) return; // context not registered yet — see sagaContextRegistered
  const { gpu } = resources;
  if (!gpu) return;

  const camera = yield* select((state: RootState) => state.view.camera);
  const { eyeM, targetM } = sceneCameraView(camera, ANY_VIEWPORT_PX);
  const forwardM = normalize3([targetM[0] - eyeM[0], targetM[1] - eyeM[1], targetM[2] - eyeM[2]]);

  // Every splat asset, not just the one that triggered: a camera commit moves
  // all of them, and a landing asset is the cheapest moment to catch up.
  for (const [assetId, asset] of resources.gpuAssets) {
    if (asset.kind !== 'gaussianSplat') continue;
    gpu.device.queue.writeBuffer(asset.order, 0, sortSplatOrder(asset.positionsM, eyeM, forwardM));
    yield* put(splatOrderWritten(assetId));
  }
}

export function* watchSplatSortSaga() {
  yield* takeLatest([commitCameraPose, assetStatusChanged], sortSplatsWorker);
}
