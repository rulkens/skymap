/**
 * loadSpacecraftTracksSaga — fetches `spacecraftTracks.bin` once the engine has
 * drawn its first frame and hands each track to the trajectory registry. A
 * failed fetch or parse is logged once and leaves the registry empty: the craft
 * stay absent and the rest of the scene is untouched. The registry write
 * invalidates the body-snapshot memo, but a paused loop never re-reads it, so
 * arrival requests a frame itself.
 */
import { call, getContext, take } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { engineStatusChanged } from '../engine/engineSlice';
import { dataUrl } from '../../services/loading/fetchWithProgress';
import { trajectoryRegistry } from '../../services/bodies/trajectoryRegistry';
import { parseSpacecraftTracks } from '../../utils/orbit/parseSpacecraftTracks';
import type { ReconcileEffects } from '../../store/effects/ReconcileEffects';

const TRACKS_FILE = 'spacecraftTracks.bin';

const isEngineReady = (action: Action): boolean =>
  engineStatusChanged.match(action) && action.payload.kind === 'ready';

async function fetchTracks(): Promise<ArrayBuffer> {
  const response = await fetch(dataUrl(TRACKS_FILE));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.arrayBuffer();
}

export function* loadSpacecraftTracksSaga() {
  yield* take(isEngineReady);
  try {
    const buf = yield* call(fetchTracks);
    for (const track of parseSpacecraftTracks(buf)) trajectoryRegistry.set(track);
  } catch (error) {
    console.warn(
      'loadSpacecraftTracksSaga: spacecraft tracks unavailable; craft stay absent',
      error,
    );
    return;
  }
  const fx = yield* getContext<ReconcileEffects | undefined>('reconcile');
  fx?.requestRender();
}
