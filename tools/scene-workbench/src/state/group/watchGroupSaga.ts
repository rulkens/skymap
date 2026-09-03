/**
 * watchGroupSaga — owns the selected group's scene: disposes the previous
 * one, fetches its manifest, then fetches/parses/uploads every asset.
 * `takeLatest` cancels a switch that lands mid-load; cancellation unwinds
 * this generator synchronously and redux-saga drops the eventual upload
 * result rather than resuming with it — `acceptLoadedAsset`, called from
 * inside each upload promise's own `.then()`, is what destroys an orphaned
 * buffer instead of leaking it; see its own doc.
 * `manifestUrl`/`artifactUrl` are data-root-relative logical paths (spec §5's
 * tree), so both go through `dataUrl()` like every other `geo3d/` file.
 */
import { call, cancelled, getContext, put, select, takeLatest } from 'typed-redux-saga';

import type { GpuContext } from '../../../../../src/@types/rendering/GpuContext';
import { dataUrl } from '../../../../../src/services/loading/fetchWithProgress';
import type { SceneAsset } from '../../../@types/SceneAsset';
import type { SceneManifest } from '../../../@types/SceneManifest';
import { disposeScene, type RenderResources } from '../../render/renderResources';
import { uploadPointCloud } from '../../render/uploadPointCloud';
import { acceptLoadedAsset } from '../../scene/acceptLoadedAsset';
import { parsePoints } from '../../scene/parsePoints';
import type { SceneSagaContext } from '../../store/sagaContext';
import type { RootState } from '../../store/types';
import { groupSelected } from '../registry/registrySlice';
import { assetStatusChanged, manifestFailed, manifestLoaded } from './groupSlice';

function* loadAssetWorker(
  asset: SceneAsset,
  gpu: GpuContext,
  resources: RenderResources,
  myEpoch: number,
  cancellation: { readonly aborted: boolean },
) {
  try {
    // Fetch → parse → upload → accept, as ONE promise chain: the staleness
    // check runs in the continuation, never after the `yield*` below.
    const built = yield* call(() =>
      fetch(dataUrl(asset.artifactUrl))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status} for ${asset.artifactUrl}`);
          return res.arrayBuffer();
        })
        .then((buffer) => {
          const { pointCount, records } = parsePoints(buffer);
          const uploaded = uploadPointCloud(gpu, records, pointCount);
          return acceptLoadedAsset(uploaded, resources, myEpoch, cancellation);
        }),
    );
    if (!built) return; // superseded while in flight — already destroyed
    resources.gpuAssets.set(asset.id, built);
    yield* put(assetStatusChanged({ assetId: asset.id, status: 'ready' }));
  } catch (err) {
    // One bad asset must not abandon its siblings, so this catch is per asset.
    console.error(`scene-workbench: asset "${asset.id}" failed to load`, err);
    yield* put(assetStatusChanged({ assetId: asset.id, status: 'error' }));
  }
}

function* loadGroupWorker(action: ReturnType<typeof groupSelected>) {
  const resources = yield* getContext<SceneSagaContext['resources']>('resources');
  if (!resources) return; // context not registered yet — see sagaContextRegistered

  // Declared OUTSIDE the try so `finally` (a separate block scope) can set it —
  // read live from inside `acceptLoadedAsset`'s promise continuation, the only
  // code that still runs if `takeLatest` cancels this generator.
  const cancellation = { aborted: false };
  try {
    disposeScene(resources);
    // The epoch this load owns: the NEXT group's own `disposeScene` (its first
    // line, same as this one) bumps it again — the second, independent guard
    // for a dispose that happens without saga cancellation at all.
    const myEpoch = resources.epoch;

    const entry = yield* select((state: RootState) =>
      state.registry.groups.find((group) => group.id === action.payload),
    );
    if (!entry) throw new Error(`no registry entry for group "${action.payload}"`);

    const manifest = yield* call(() =>
      fetch(dataUrl(entry.manifestUrl), { cache: 'no-cache' }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.manifestUrl}`);
        return res.json() as Promise<SceneManifest>;
      }),
    );
    yield* put(manifestLoaded(manifest));

    // Viewport registers the saga context only once `initGpu` has resolved, so
    // a null device here means the device was never acquired (no WebGPU).
    const { gpu } = resources;
    if (!gpu) throw new Error('no GPU device — the viewport never acquired one');

    for (const asset of manifest.assets) {
      yield* call(loadAssetWorker, asset, gpu, resources, myEpoch, cancellation);
    }
  } catch (err) {
    yield* put(manifestFailed((err as Error).message));
  } finally {
    // Runs SYNCHRONOUSLY at cancellation, before any pending promise settles —
    // which is what makes `cancellation.aborted` reliable for the uploads still
    // in flight. Frees what already landed; the in-flight ones free themselves.
    if (yield* cancelled()) {
      cancellation.aborted = true;
      disposeScene(resources);
    }
  }
}

export function* watchGroupSaga() {
  yield* takeLatest(groupSelected, loadGroupWorker);
}
