/**
 * projectFramePose over a `{ sky }` regime: the sky arm's tag pins the eye, so a
 * refold into it throws the position away. A pose produced in another frame must
 * release the arm and be drawn where it was produced; a sky pose must not.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
// Reads window.devicePixelRatio, which the node environment has no window for.
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { projectFramePose } from '../../../../src/services/engine/frame/projectFramePose';
import { refoldTo } from '../../../../src/services/engine/camera/arms/refoldTo';
import { foldToWorld } from '../../../../src/services/engine/camera/arms/foldToWorld';
import { isWorldArm } from '../../../../src/services/engine/camera/arms/world/isWorldArm';
import { EMPTY_TILT_MEMORY } from '../../../../src/services/engine/camera/data/emptyTiltMemory';
import { pivotFraming } from '../../../../src/services/engine/camera/framing/pivotRadiusMpc';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { commitCameraPose } from '../../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../../src/utils/camera/arms/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/orbitPose/eyeMpcOf';
import { symmetricFrustum } from '../../../../src/utils/camera/frustum/symmetricFrustum';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import type { CameraArmCtx } from '../../../../src/@types/camera/arms/CameraArmCtx';
import type { FramedCameraPose } from '../../../../src/@types/camera/pose/FramedCameraPose';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const SKY = {
  sky: { body: asSceneBodyId('earth'), lonRad: 0.2186, latRad: 0.9716 },
} as const;
/** Looking straight down, so a longer `distance` lifts the eye up the spot's radial. */
const AT_FEET: FramedCameraPose = {
  frame: SKY,
  pose: { azimuthRad: 0, altitudeRad: -Math.PI / 2 },
};

describe('projectFramePose over a sky regime', () => {
  const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
  h.store.dispatch(commitCameraPose(AT_FEET));
  const intent = h.store.getState().camera;
  // No focus: the sky arm's focus rule alone never releases it.
  const ctx: CameraArmCtx = {
    bodies: deriveBodyStates(CONST_J2000),
    poseBasis: B,
    upBasis: B,
    terrainHeightAt: datumOnlyTerrainHeight,
    focusBodyId: null,
    pivot: pivotFraming(null),
    viewportPx: [1000, 1000],
    frustum: symmetricFrustum(Math.PI / 3, 1),
    fovYRad: Math.PI / 3,
    tuning: intent.tuning,
    nowMs: 0,
  };
  const project = (render: FramedCameraPose) =>
    projectFramePose({
      render,
      authoredOverride: null,
      pivotsOnFocusedBody: false,
      focus: null,
      follow: null,
      tilt: EMPTY_TILT_MEMORY,
      intent,
      gestureHeld: false,
      ctx,
    });

  it('a world pose off the spot releases the arm and is drawn where it was produced', () => {
    const atSpot = refoldTo(AT_FEET, 'absolute', ctx);
    if (!isWorldArm(atSpot)) throw new Error('refoldTo did not land the world arm');
    const raised = absoluteArm({
      ...atSpot.pose,
      distance: atSpot.pose.distance + 2e6 * SCALE_UNITS.M_TO_MPC,
    });

    const out = project(raised);

    expect(out.displayed.frame).toEqual({ body: 'earth' });
    expect(out.actions.map((a) => a.type)).toEqual([commitCameraPose.type]);
    const eye = eyeMpcOf(foldToWorld(out.displayed, ctx), B);
    const produced = eyeMpcOf(raised.pose, B);
    const offM = Math.hypot(...eye.map((v, i) => v - produced[i]!)) / SCALE_UNITS.M_TO_MPC;
    expect(offM).toBeLessThan(1);
  });

  it('a pose in the sky frame keeps the arm', () => {
    const out = project(AT_FEET);

    expect(out.displayed).toBe(AT_FEET);
    expect(out.actions).toEqual([]);
  });
});
