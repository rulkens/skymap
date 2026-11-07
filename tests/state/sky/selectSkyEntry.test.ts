/**
 * selectSkyEntry — the readout's centre spot passes only under the ceiling, while not standing
 * (D9), and while no takeover or camera clip owns the camera.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { selectSkyEntry } from '../../../src/state/sky/selectSkyEntry';
import {
  engineSkyEntryReported,
  engineSkyViewReported,
} from '../../../src/state/engine/engineSlice';
import { takeoverStarted } from '../../../src/state/takeover/takeoverActions';
import { clipStarted } from '../../../src/state/camera/cameraSlice';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import type { RootState } from '../../../src/store/types';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';

const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2, latRad: 0.9 };

function storeAt(altitudeM: number, spot: SkySpot | null = SPOT) {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(
    engineSkyEntryReported({ spot, pointLocalM: spot === null ? null : [1, 2, 3], altitudeM }),
  );
  return store;
}

const entry = (store: ReturnType<typeof storeAt>) =>
  selectSkyEntry(store.getState() as unknown as RootState);

describe('selectSkyEntry', () => {
  it('offers the centre spot below 20 km', () => {
    expect(entry(storeAt(15_000))).toEqual(SPOT);
  });

  it('is null above 20 km', () => {
    expect(entry(storeAt(20_500))).toBeNull();
  });

  it('is null on a miss or off a terrain host (the readout carries no spot)', () => {
    expect(entry(storeAt(5_000, null))).toBeNull();
  });

  it('is null while standing', () => {
    const store = storeAt(5_000);
    store.dispatch(
      engineSkyViewReported({ spot: SPOT, azimuthRad: 0, altitudeRad: 0, fovYRad: 1 }),
    );
    expect(entry(store)).toBeNull();
  });

  it('is null during a tour', () => {
    const store = storeAt(5_000);
    store.dispatch(takeoverStarted({ kind: 'tour', id: 'grandTour' }));
    expect(entry(store)).toBeNull();
  });

  it('is null while a camera clip plays', () => {
    const store = storeAt(5_000);
    store.dispatch(clipStarted({ data: { start: 'live', timeline: [] }, frame: 'ecliptic' }));
    expect(entry(store)).toBeNull();
  });
});
