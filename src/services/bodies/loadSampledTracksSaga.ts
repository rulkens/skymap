/**
 * loadSampledTracksSaga — once the engine has drawn its first frame, fetches
 * `sampledTrack.<id>.bin` for each id and hands its track to the trajectory
 * registry. A failed fetch or parse warns and leaves that body absent; the
 * others still load. The registry write invalidates the body-snapshot memo, but
 * a paused loop never re-reads it, so arrival requests a frame itself.
 */
import { all, call, getContext, take } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { engineStatusChanged } from '../../state/engine/engineSlice';
import { dataUrl } from '../loading/fetchWithProgress';
import { trajectoryRegistry } from './trajectoryRegistry';
import { parseSampledTracks } from './parseSampledTracks';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';
import type { SagaFactory } from '../../@types/engine/layer/SagaFactory';
import type { SampledTrack } from '../../@types/scene/SampledTrack';
import type { SceneBodyId } from '../../@types/scene/SceneBodyId';

const isEngineReady = (action: Action): boolean =>
  engineStatusChanged.match(action) && action.payload.kind === 'ready';

async function fetchTracks(id: SceneBodyId): Promise<SampledTrack[]> {
  try {
    const response = await fetch(dataUrl(`sampledTrack.${id}.bin`));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return parseSampledTracks(await response.arrayBuffer());
  } catch (error) {
    console.warn(`loadSampledTracksSaga: track ${id} unavailable; it stays absent`, error);
    return [];
  }
}

export function loadSampledTracksSaga(ids: readonly SceneBodyId[]): SagaFactory {
  return function* () {
    yield* take(isEngineReady);
    const tracks = (yield* all(ids.map((id) => call(fetchTracks, id)))).flat();
    if (tracks.length === 0) return;
    for (const track of tracks) trajectoryRegistry.set(track);
    const fx = yield* getContext<ReconcileEffects | undefined>('reconcile');
    fx?.requestRender();
  };
}
