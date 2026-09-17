/**
 * watchOutlineSaga — loads each mesh's outline with its manifest, runs draw mode's
 * enter / save / discard against `/api/outline`, and keeps GPU preview masks in sync. Camera
 * changes are explicit `put`s to `view`: cross-slice extraReducers on outline
 * actions have dropped silently in this project before.
 */
import type { Action } from '@reduxjs/toolkit';
import { call, getContext, put, select, takeEvery, takeLatest } from 'typed-redux-saga';

import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { MeshOutline } from '../../../@types/MeshOutline';
import { writeMeshMask } from '../../render/writeMeshMask';
import { isZOnlyRotation } from '../../scene/isZOnlyRotation';
import type { SceneSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { drawOutlineRequested, outlineDiscardRequested, outlineSaveRequested } from '../commands';
import { assetStatusChanged, manifestLoaded } from '../group/groupSlice';
import { groupSelected } from '../registry/registrySlice';
import { commitCameraPose } from '../view/viewSlice';
import {
  draftEnded,
  draftStarted,
  outlineLoaded,
  outlineSaved,
  outlineSaveFailed,
  outlineSlice,
} from './outlineSlice';
import { selectIsDrawingOutline } from './selectIsDrawingOutline';
import { selectMaskRing } from './selectMaskRing';

const outlineUrl = (groupId: string, assetId: string) => `/api/outline/${groupId}/${assetId}`;

/** Also matches `groupSelected`, cancelled here rather than let it fall through — a `manifestLoaded`
 *  in the OLD group's GETs races the picker's `groupSelected` clearing the slice; without cancelling
 *  right at the switch, a late 200 for the old group's asset id can `outlineLoaded` into the new one. */
function* loadOutlinesWorker(
  action: ReturnType<typeof manifestLoaded> | ReturnType<typeof groupSelected>,
) {
  if (groupSelected.match(action)) return;
  const { groupId, assets } = action.payload;
  for (const asset of assets) {
    if (asset.kind !== 'mesh') continue;
    try {
      const outline = yield* call(() =>
        fetch(outlineUrl(groupId, asset.id), { cache: 'no-cache' }).then((res) => {
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<MeshOutline>;
        }),
      );
      if (outline) yield* put(outlineLoaded({ assetId: asset.id, ringM: [...outline.ringM] }));
    } catch (err) {
      console.error(`scene-workbench: outline of "${asset.id}" failed to load`, err);
    }
  }
}

function* drawOutlineWorker(action: ReturnType<typeof drawOutlineRequested>) {
  const assetId = action.payload;
  const { asset, saved, camera, drawing } = yield* select((state: RootState) => ({
    asset: state.group.manifest?.assets.find((a) => a.id === assetId),
    saved: state.outline.byAssetId[assetId],
    camera: state.view.camera,
    drawing: selectIsDrawingOutline(state),
  }));
  // A second enter (e.g. a stray click on another mesh's "Draw outline") would overwrite the
  // live draft's returnPose with the already-orthographic camera, stranding the perspective pose.
  if (drawing) return;
  if (asset?.kind !== 'mesh') return;
  // Picking maps screen XY through the inverse transform in the plane; a tilt breaks that.
  if (!isZOnlyRotation(asset.transform.rotation)) {
    console.warn(
      `scene-workbench: "${assetId}" is rotated off Z — draw mode needs a Z-only rotation`,
    );
    return;
  }
  yield* put(
    draftStarted({
      assetId,
      ringM: saved ? [...saved.ringM] : [],
      closed: saved !== undefined,
      returnPose: camera,
    }),
  );
  yield* put(commitCameraPose({ ...camera, projection: 'orthographic' }));
}

function* saveOutlineWorker() {
  const { draft, groupId } = yield* select((state: RootState) => ({
    draft: state.outline.draft,
    groupId: state.group.manifest?.groupId,
  }));
  if (!draft?.closed || groupId === undefined) return;
  try {
    const ringM = yield* call(async () => {
      const res = await fetch(outlineUrl(groupId, draft.assetId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatVersion: 1, ringM: draft.ringM }),
      });
      const body = (await res.json().catch(() => ({}))) as { ringM?: Vec2[]; error?: string };
      if (!res.ok || !body.ringM) throw new Error(body.error ?? res.statusText);
      return body.ringM;
    });
    // A group switch during the PUT's round trip already cleared this group/draft; applying the
    // late response would write the new group's asset (ids can collide) or resurrect a dead draft.
    const stillCurrent = yield* select(
      (state: RootState) =>
        state.group.manifest?.groupId === groupId && state.outline.draft?.assetId === draft.assetId,
    );
    if (!stillCurrent) return;
    // The server's ring, not the draft's: normalization may have reversed or trimmed it.
    yield* put(outlineSaved({ assetId: draft.assetId, ringM }));
    yield* put(commitCameraPose(draft.returnPose));
    yield* put(draftEnded());
  } catch (err) {
    yield* put(outlineSaveFailed((err as Error).message));
  }
}

function* discardOutlineWorker() {
  const draft = yield* select((state: RootState) => state.outline.draft);
  if (!draft) return;
  yield* put(commitCameraPose(draft.returnPose));
  yield* put(draftEnded());
}

// Any outline change can move a mask, and a mesh that just finished uploading needs its first.
const touchesMask = (action: Action): boolean =>
  action.type.startsWith(`${outlineSlice.name}/`) ||
  (assetStatusChanged.match(action) && action.payload.status === 'ready');

/** Runs inside the dispatch that already marked the viewport dirty, so the next frame sees it. */
function* syncMasksWorker() {
  const resources = yield* getContext<SceneSagaContext['resources']>('resources');
  if (!resources?.gpu) return;
  const state = yield* select((s: RootState) => s);
  for (const [assetId, asset] of resources.gpuAssets) {
    if (asset.kind === 'mesh') {
      writeMeshMask(resources.gpu.device, asset, selectMaskRing(state, assetId));
    }
  }
}

export function* watchOutlineSaga() {
  yield* takeEvery(touchesMask, syncMasksWorker);
  yield* takeLatest([groupSelected, manifestLoaded], loadOutlinesWorker);
  yield* takeEvery(drawOutlineRequested, drawOutlineWorker);
  yield* takeEvery(outlineSaveRequested, saveOutlineWorker);
  // A group switch discards like the button: the draft's asset is gone, its return pose is not.
  yield* takeEvery([outlineDiscardRequested, groupSelected], discardOutlineWorker);
}
