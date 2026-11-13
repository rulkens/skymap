/**
 * A steady wheel-out while standing, end to end: the zoom-limit saga, the real clip player and
 * the frame loop. It lifts once and lands on the body arm. A notch on the lift's hand-off frame
 * (the clip just ended, its body-arm end pose not yet baked over the sky `base`) used to step the
 * sky arm from that stale `base`, so the edge baked a sky pose and the next notches lifted again.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { watchZoomLimitSaga } from '../../../src/state/camera/watchZoomLimitSaga';
import { commitCameraPose, setFovYRad } from '../../../src/state/camera/cameraIntentSlice';
import { cameraArmKindOf } from '../../../src/services/engine/camera/arms/cameraArmKindOf';
import { LENS_MAX_DEG } from '../../../src/data/camera/lensMaxDeg';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { degToRad } from '../../../src/utils/math/degToRad';
import { makeCameraSimHarness } from '../../helpers/camera/makeCameraSimHarness';
import { installAppSelectionKinds } from '../../support/installAppSelectionKinds';
import type { SkySpot } from '../../../src/@types/camera/pose/SkySpot';
import type { RootState } from '../../../src/store/types';

installAppSelectionKinds();

const SPOT: SkySpot = { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 };

describe('a steady scroll-out while standing', () => {
  it('lifts once and lands on the body arm, a notch on the hand-off frame included', () => {
    const h = makeCameraSimHarness({ realClipPlayer: true, sagas: [watchZoomLimitSaga] });
    const state = () => h.store.getState() as unknown as RootState;
    h.store.dispatch(
      commitCameraPose({ frame: { sky: SPOT }, pose: { azimuthRad: 1, altitudeRad: 0.3 } }),
    );
    h.store.dispatch(setFovYRad(degToRad(LENS_MAX_DEG)));
    h.frame(2);

    let lifts = 0;
    let clip = state().camera.intent.clip;
    // A notch every frame, so one always lands on the frame the lift's clip hands back.
    for (let f = 0; f < 300; f++) {
      h.notch(100);
      h.frame(1);
      if (state().camera.intent.clip !== clip && state().camera.intent.clip !== null) lifts++;
      clip = state().camera.intent.clip;
    }

    expect(lifts).toBe(1);
    expect(clip).toBeNull();
    expect(cameraArmKindOf(state().camera.intent.base.frame)).toBe('body');
  });
});
