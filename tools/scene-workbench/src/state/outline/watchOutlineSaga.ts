/**
 * watchOutlineSaga — loads each mesh's outline with its manifest and runs draw
 * mode's enter / save / discard against `/api/outline` (`outlinePlugin`). Camera
 * changes are explicit `put`s to `view`: cross-slice extraReducers on outline
 * actions have dropped silently in this project before.
 */
import { call, put, select, takeEvery, takeLatest } from 'typed-redux-saga';

import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { MeshOutline } from '../../../@types/MeshOutline';
import { isZOnlyRotation } from '../../scene/isZOnlyRotation';
import type { RootState } from '../../store/types';
import { drawOutlineRequested, outlineDiscardRequested, outlineSaveRequested } from '../commands';
import { manifestLoaded } from '../group/groupSlice';
import { commitCameraPose } from '../view/viewSlice';
import {
  draftEnded,
  draftStarted,
  outlineLoaded,
  outlineSaved,
  outlineSaveFailed,
} from './outlineSlice';

const outlineUrl = (groupId: string, assetId: string) => `/api/outline/${groupId}/${assetId}`;

function* loadOutlinesWorker(action: ReturnType<typeof manifestLoaded>) {
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
  const { asset, saved, camera } = yield* select((state: RootState) => ({
    asset: state.group.manifest?.assets.find((a) => a.id === assetId),
    saved: state.outline.byAssetId[assetId],
    camera: state.view.camera,
  }));
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

export function* watchOutlineSaga() {
  yield* takeLatest(manifestLoaded, loadOutlinesWorker);
  yield* takeEvery(drawOutlineRequested, drawOutlineWorker);
  yield* takeEvery(outlineSaveRequested, saveOutlineWorker);
  yield* takeEvery(outlineDiscardRequested, discardOutlineWorker);
}
