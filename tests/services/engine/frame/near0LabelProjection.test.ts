import { describe, it, expect } from 'vitest';
import { near0LabelProjection } from '../../../../src/services/engine/frame/near0LabelProjection';
import { computeForegroundViewProj } from '../../../../src/utils/camera/projection/computeForegroundViewProj';
import { forwardProjectPoint } from '../../../../src/utils/camera/projection/forwardProjectPoint';
import { foregroundFrustum } from '../../../../src/utils/camera/frustum/foregroundFrustum';
import { symmetricFrustum } from '../../../../src/utils/camera/frustum/symmetricFrustum';
import { projectLabels } from '../../../../src/utils/labels/projectLabels';
import { VIEW_RIGS } from '../../../../src/data/rendering/viewRigs';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { NEAR0, SLAB_REVERSED_Z } from '../../../../src/services/engine/frame/slabs';
import type { ForwardProjectedPoint } from '../../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { Label2D } from '../../../../src/@types/rendering/Label2D';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const M = SCALE_UNITS.M_TO_MPC;
const FRUSTUM = symmetricFrustum(Math.PI / 4, 16 / 9);

/**
 * The pose the old label shrink was measured at: camera a solar-system distance
 * from the render origin (which forces the f64 rebase), 31 m off a body,
 * looking along +x with +y up.
 */
function near0Ctx(): FrameView {
  const camDistance = 31 * M;
  const eye: Vec3 = [SCALE_UNITS.AU_TO_MPC, 0, 0];
  const { near, far } = foregroundFrustum(camDistance);
  const vp = computeForegroundViewProj({
    eyeMpc: eye,
    targetMpc: [eye[0] + camDistance, 0, 0],
    up: [0, 1, 0],
    renderOrigin: [0, 0, 0],
    frustum: FRUSTUM,
    near,
    far,
    reversedZ: SLAB_REVERSED_Z[NEAR0]!,
  });
  // right | up | back columns: right = −z, up = +y, back = −x.
  const basis: Mat3 = [0, 0, -1, 0, 1, 0, -1, 0, 0];
  return {
    slabs: [{ near, far, vp }],
    cam: { yaw: 0, pitch: 0, poseBasis: basis, upBasis: basis },
    frustum: FRUSTUM,
    drawCamPos: eye,
    canvasSize: { width: 1600, height: 900 },
    drawPxPerRad: 900 / (FRUSTUM.tanUp - FRUSTUM.tanDown),
  } as unknown as FrameView;
}

describe('near0LabelProjection', () => {
  it('puts a metre-range anchor on the pixel the f64 rebased vp puts it', () => {
    const projection = near0LabelProjection(near0Ctx(), VIEW_RIGS.mono);
    // ~10 m ahead of the eye, a little off-axis so the comparison has signal.
    const anchor: Vec3 = [10 * M, 1 * M, 2 * M];
    const [projected] = projectLabels([{ worldPos: anchor } as Label2D], projection, () => null);
    const ref: ForwardProjectedPoint = {
      clipX: 0,
      clipY: 0,
      clipZ: 0,
      clipW: 0,
      screenX: 0,
      screenY: 0,
      onScreen: false,
    };
    forwardProjectPoint(projection.vp, ...anchor, projection.output.sizePx, ref);
    expect(projected!.screenPx![0]).toBeCloseTo(ref.screenX, 6);
    expect(projected!.screenPx![1]).toBeCloseTo(ref.screenY, 6);
    // The declutter's em divisor: the anchor's view depth, as the vp's clip w was.
    expect(projected!.clipW / ref.clipW).toBeCloseTo(1, 12);
  });
});
