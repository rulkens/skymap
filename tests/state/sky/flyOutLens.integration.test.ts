/**
 * A focus fly out of the sky, end to end: the takeover, the F key, the focus tween and the frame
 * loop. Standing, the wheel narrows the lens to anything; a fly that leaves must land on the
 * default lens, while a fly from orbit keeps whatever lens the person set.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { all, fork, setContext } from 'redux-saga/effects';

import { watchTakeoverSaga } from '../../../src/state/takeover/watchTakeoverSaga';
import { watchFocusSelectedSaga } from '../../../src/state/selection/watchFocusSelectedSaga';
import { watchFocusTweenSaga } from '../../../src/state/selection/watchFocusTweenSaga';
import { watchSelectionRowsSaga } from '../../../src/state/selectionRows/watchSelectionRowsSaga';
import { enterSky } from '../../../src/state/sky/enterSky';
import { focusSelected } from '../../../src/state/selection/focusSelected';
import { updateSelectionSelect } from '../../../src/state/selection/selectionSlice';
import { commitCameraPose, setFovYRad } from '../../../src/state/camera/cameraIntentSlice';
import { selectTakeoverSource } from '../../../src/state/takeover/selectors';
import { DEFAULT_FOV_Y_RAD } from '../../../src/services/engine/camera/framing/cameraFraming';
import { composeSelectionRows } from '../../../src/services/engine/selection/composeSelectionRows';
import { bodySelectionRow } from '../../../src/layers/body/selection/bodySelectionRow';
import { milkyWaySelectionRow } from '../../../src/layers/milkyWay/selection/milkyWaySelectionRow';
import { cameraArmKindOf } from '../../../src/services/engine/camera/arms/cameraArmKindOf';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { degToRad } from '../../../src/utils/math/degToRad';
import { makeCameraSimHarness } from '../../helpers/camera/makeCameraSimHarness';
import { bodyPickCodes, milkyWayPickCode } from '../../support/layerPickCodes';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';
import { NO_KINDS_OFF } from '../../support/noKindsOff';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { RootState } from '../../../src/store/types';

installAppSelectionKinds();

const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };
const NARROW = degToRad(5);

function* sagas() {
  yield setContext({
    selection: composeSelectionRows(
      () => [
        bodySelectionRow({ pickCodes: bodyPickCodes() }),
        milkyWaySelectionRow(milkyWayPickCode()),
      ],
      () => NO_KINDS_OFF,
    ),
  });
  yield all([
    fork(watchTakeoverSaga),
    fork(watchSelectionRowsSaga),
    fork(watchFocusSelectedSaga),
    fork(watchFocusTweenSaga),
  ]);
}

function harness() {
  const h = makeCameraSimHarness({ realClipPlayer: true, sagas: [sagas] });
  h.frame(2);
  const state = () => h.store.getState() as unknown as RootState;
  /** The F key on the Milky Way (no body, so the sky arm lets go), run until the fly lands. */
  const flyToMilkyWay = (): number[] => {
    h.store.dispatch(updateSelectionSelect({ type: 'milkyWay' }));
    h.store.dispatch(focusSelected());
    h.frame(1);
    expect(state().camera.intent.tween).not.toBeNull();
    const drawn: number[] = [];
    for (let i = 0; i < 1000 && state().camera.intent.tween !== null; i++) {
      h.frame(1);
      drawn.push(h.state.cameraRuntime.outputs.projection.fovYRad);
    }
    h.frame(5);
    return drawn;
  };
  return { h, state, flyToMilkyWay };
}

describe('a focus fly out of the sky', () => {
  it('eases a narrowed sky lens back to the default and ends the takeover', () => {
    const { h, state, flyToMilkyWay } = harness();
    h.store.dispatch(
      commitCameraPose({ frame: { sky: SPOT }, pose: { azimuthRad: 1, altitudeRad: 0.3 } }),
    );
    h.frame(2);
    h.store.dispatch(enterSky({ spot: SPOT, pointLocalM: null }));
    for (let i = 0; i < 1000 && state().camera.intent.clip !== null; i++) h.frame(1);
    h.frame(2);
    expect(selectTakeoverSource(state())).toMatchObject({ kind: 'sky' });
    h.store.dispatch(setFovYRad(NARROW));
    h.frame(2);

    const drawn = flyToMilkyWay();

    expect(drawn.some((fov) => fov > NARROW * 2 && fov < DEFAULT_FOV_Y_RAD / 2)).toBe(true);
    expect(cameraArmKindOf(state().camera.intent.base.frame)).not.toBe('sky');
    expect(selectTakeoverSource(state())).toBeNull();
    expect(state().camera.intent.fovYRad).toBeCloseTo(DEFAULT_FOV_Y_RAD, 9);
  });

  it('keeps the lens of a fly that starts off the ground', () => {
    const { h, state, flyToMilkyWay } = harness();
    h.store.dispatch(setFovYRad(NARROW));
    h.frame(2);

    flyToMilkyWay();

    expect(state().camera.intent.fovYRad).toBe(NARROW);
  });
});
