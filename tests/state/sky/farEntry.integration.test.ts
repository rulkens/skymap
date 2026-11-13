/**
 * A far sky entry (a place or typed coordinates: no ground point) end to end: the real takeover
 * sagas over the frame loop and the real clip player. The approach must play, the centre readout
 * must name the ground under the spot on the way down, and the glide must leave the person standing.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { enterSky } from '../../../src/state/sky/enterSky';
import { commitCameraPose } from '../../../src/state/camera/cameraIntentSlice';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { offSpotM } from '../../../src/utils/sky/offSpotM';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { makeCameraSimHarness } from '../../helpers/camera/makeCameraSimHarness';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { RootState } from '../../../src/store/types';

installAppSelectionKinds();

const EARTH = asSceneBodyId('earth');
const PARIS: SkySpot = { body: EARTH, lonRad: 0.041, latRad: 0.8527 };
const SONDERMARKEN: SkySpot = { body: EARTH, lonRad: 0.2186, latRad: 0.9716 };

function enterFarAndLand(standAt: SkySpot | null) {
  const h = makeCameraSimHarness({ realClipPlayer: true, sagas: [watchTakeoverSaga] });
  h.frame(2);
  if (standAt !== null) {
    h.store.dispatch(
      commitCameraPose({ frame: { sky: standAt }, pose: { azimuthRad: 1, altitudeRad: 0.3 } }),
    );
    h.frame(2);
  }
  const grounds: Vec3[] = [];
  h.store.subscribe(() => {
    const point = (h.store.getState() as unknown as RootState).sky.entry.pointLocalM;
    if (point !== null && grounds.at(-1) !== point) grounds.push(point);
  });
  h.store.dispatch(enterSky({ spot: PARIS, pointLocalM: null }));
  // A readout in time starts the glide in the approach's own end tick, so the camera never
  // rests between the two; the 1.5 s fallback would leave it clipless here.
  for (let i = 0; i < 1000 && h.store.getState().camera.intent.clip !== null; i++) h.frame(1);
  h.frame(2);
  return { state: h.store.getState() as unknown as RootState, grounds };
}

describe('a far sky entry', () => {
  it.each([
    ['from orbit', null],
    ['from standing elsewhere', SONDERMARKEN],
  ])('%s lands standing on the spot', (_, standAt) => {
    const { state, grounds } = enterFarAndLand(standAt);

    expect(grounds.some((p) => offSpotM(p, PARIS) < 1000)).toBe(true);
    expect(state.camera.intent.clip).toBeNull();
    // Within the readout's match distance of the spot: 1 km is ~1.6e-4 rad of Earth.
    expect(state.camera.intent.base.frame).toEqual({
      sky: {
        body: EARTH,
        lonRad: expect.closeTo(PARIS.lonRad, 3),
        latRad: expect.closeTo(PARIS.latRad, 3),
      },
    });
    expect(selectTakeoverSource(state)).toMatchObject({ kind: 'sky', spot: PARIS });
  });
});
