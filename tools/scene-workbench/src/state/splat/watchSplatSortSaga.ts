/**
 * watchSplatSortSaga — re-sorts every splat asset's GPU `order` buffer
 * far→near at each gesture-boundary camera commit, whenever a splat lands,
 * and whenever the clip box moves (the sort is what applies it).
 * No staleness guard: the sort is synchronous, so nothing can run between
 * reading `positionsM` and its `writeBuffer`. An asset a group switch disposed
 * is simply absent from `gpuAssets` by the time this reads the map.
 */
import { getContext, put, select, takeLatest } from 'typed-redux-saga';

import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { BoundsM } from '../../../@types/BoundsM';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { sceneCameraView } from '../../render/sceneCameraView';
import { sortSplatOrder } from '../../scene/sortSplatOrder';
import type { SceneSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { assetStatusChanged } from '../group/groupSlice';
import { commitCameraPose, setSplatClipBox } from '../view/viewSlice';
import { splatOrderWritten } from '../commands';

/** Eye and forward are pose-only — the viewport size never reaches them. */
const ANY_VIEWPORT_PX = [1, 1] as const;

/** Tight enough that only an exactly-repeated direction passes: a real orbit
 *  step moves a unit vector by orders of magnitude more than this. */
const DIRECTION_EPSILON = 1e-6;

/** What the last sort ran against — direction `null` once it can no longer be
 *  trusted. Per-watcher, not module-scoped, so it dies with the store. */
type SortMemo = { forwardM: Vec3 | null; clipBoxM: BoundsM | null };

function* sortSplatsWorker(
  memo: SortMemo,
  action:
    | ReturnType<typeof commitCameraPose>
    | ReturnType<typeof assetStatusChanged>
    | ReturnType<typeof setSplatClipBox>,
) {
  const assetLanded = assetStatusChanged.match(action);
  if (assetLanded) {
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

  const clipBoxM = yield* select((state: RootState) => state.view.display.gaussianSplat.clipBoxM);
  const camera = yield* select((state: RootState) => state.view.camera);
  const { eyeM, targetM } = sceneCameraView(camera, ANY_VIEWPORT_PX);
  const forwardM = normalize3([targetM[0] - eyeM[0], targetM[1] - eyeM[1], targetM[2] - eyeM[2]]);

  // A pure translation (wheel zoom, pan) shifts every depth by the same
  // constant, so the permutation is provably identical — and wheel zoom
  // commits a pose per frame, each otherwise a ~8 ms blocked main thread.
  // A splat that just landed has never been sorted, so it never skips. The
  // box compares by identity: its reducer replaces the object, so a new
  // reference is exactly a changed box, and it changes which splats sort.
  if (
    !assetLanded &&
    memo.forwardM &&
    sameDirection(memo.forwardM, forwardM) &&
    memo.clipBoxM === clipBoxM
  ) {
    return;
  }

  // Every splat asset, not just the one that triggered: a camera commit moves
  // all of them, and a landing asset is the cheapest moment to catch up.
  let sorted = 0;
  for (const [assetId, asset] of resources.gpuAssets) {
    if (asset.kind !== 'gaussianSplat') continue;
    const order = sortSplatOrder(asset.positionsM, eyeM, forwardM, clipBoxM);
    gpu.device.queue.writeBuffer(asset.order, 0, order);
    // The clipped-away tail of the buffer keeps the previous sort's indices;
    // `drawCount` is what stops the renderer from ever reaching them.
    asset.drawCount = order.length;
    yield* put(
      splatOrderWritten({
        assetId,
        drawCount: order.length,
        splatCount: asset.splatCount,
        boundsM: asset.boundsM,
      }),
    );
    sorted += 1;
  }
  // Nothing sorted means a group switch emptied the map; forget the direction
  // so the next group's first commit is not skipped against it.
  memo.forwardM = sorted > 0 ? forwardM : null;
  memo.clipBoxM = clipBoxM;
}

function sameDirection(a: Vec3, b: Vec3): boolean {
  return (
    Math.abs(a[0] - b[0]) < DIRECTION_EPSILON &&
    Math.abs(a[1] - b[1]) < DIRECTION_EPSILON &&
    Math.abs(a[2] - b[2]) < DIRECTION_EPSILON
  );
}

export function* watchSplatSortSaga() {
  const memo: SortMemo = { forwardM: null, clipBoxM: null };
  yield* takeLatest(
    [commitCameraPose, assetStatusChanged, setSplatClipBox],
    sortSplatsWorker,
    memo,
  );
}
