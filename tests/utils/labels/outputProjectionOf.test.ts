import { describe, expect, it } from 'vitest';
import type { ForwardProjectedPoint } from '../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { DOME_LABEL_SCALE } from '../../../src/data/labels/domeLabelScale';
import { REFERENCE_PX_PER_RAD } from '../../../src/data/labels/referencePxPerRad';
import { DOME_FACES } from '../../../src/data/rendering/domeFaces';
import { DOME_PARAMS } from '../../../src/data/rendering/domeParams';
import { orbitForwardOf } from '../../../src/utils/camera/orbitPose/orbitForwardOf';
import { domeFaceRotations } from '../../../src/utils/dome/domeFaceRotations';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { forwardProjectPoint } from '../../../src/utils/camera/projection/forwardProjectPoint';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { outputProjectionOf } from '../../../src/utils/labels/outputProjectionOf';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { frameViewsAt } from '../../helpers/frame/frameViewsAt';

// frameViewsAt's 1-rad lens on a 1920×1080 canvas, shifted as a cover shift would.
const TAN_UP = Math.tan(0.5);
const TAN_RIGHT = (TAN_UP * 1920) / 1080;

describe('outputProjectionOf', () => {
  it("projects through the mono pinhole where the view's own vp does", () => {
    const eye: Vec3 = [3e-12, -2e-12, 1e-12];
    const [view] = frameViewsAt({
      eyeMpc: eye,
      forward: [0.3, -0.5, 0.81],
      distanceMpc: 1e-3,
      frustum: {
        tanLeft: -TAN_RIGHT + 0.15,
        tanRight: TAN_RIGHT + 0.15,
        tanDown: -TAN_UP - 0.08,
        tanUp: TAN_UP - 0.08,
      },
    });
    const output = outputProjectionOf(view!, VIEW_RIGS.mono);
    const drawn = view!.drawCamPos;
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(output.camHi[k]! + output.camLo[k]! - drawn[k]!)).toBeLessThan(1e-24);
    }

    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    const ref: ForwardProjectedPoint = {
      clipX: 0,
      clipY: 0,
      clipZ: 0,
      clipW: 0,
      screenX: 0,
      screenY: 0,
      onScreen: false,
    };
    let checked = 0;
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const p: Vec3 = [0.3 + i * 0.09, -0.5 + j * 0.07, 0.81 + (i + j) * 0.05];
        const v = rotateVec3ByTightMat3(output.viewFromWorld, [
          p[0] - drawn[0],
          p[1] - drawn[1],
          p[2] - drawn[2],
        ]);
        projectLabel(v, output, out);
        forwardProjectPoint(view!.vp, p[0], p[1], p[2], output.sizePx, ref);
        expect(out.visible).toBe(true);
        expect(Math.abs(out.px[0] - ref.screenX)).toBeLessThan(0.01);
        expect(Math.abs(out.px[1] - ref.screenY)).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBe(81);
  });

  it("scales authored px by the canvas's device pixel ratio", () => {
    const at = { eyeMpc: [0, 0, 0] as Vec3, forward: [0, 0, -1] as Vec3, distanceMpc: 1 };
    expect(outputProjectionOf(frameViewsAt(at)[0]!, VIEW_RIGS.mono).pxScale).toBe(1);
    const [dense] = frameViewsAt({ ...at, dpr: 2 });
    expect(outputProjectionOf(dense!, VIEW_RIGS.mono).pxScale).toBe(2);
  });
});

describe('outputProjectionOf, equidistant', () => {
  const at = { eyeMpc: [3e-12, -2e-12, 1e-12] as Vec3, forward: [0.3, -0.5, 0.81] as Vec3 };
  // A square canvas: the resample stretches its circle over the whole output.
  const square = (view: FrameView): FrameView => ({
    ...view,
    canvasSize: { width: 2000, height: 2000 },
  });
  const [canvas] = frameViewsAt({ ...at, distanceMpc: 1e-3 }).map(square);
  const output = outputProjectionOf(canvas!, VIEW_RIGS.dome);
  // Rows of the pinhole rotation are the camera's right, up and forward in world.
  const pinhole = outputProjectionOf(canvas!, VIEW_RIGS.mono).viewFromWorld;
  const camUp: Vec3 = [pinhole[1], pinhole[4], pinhole[7]];
  const camForward: Vec3 = [pinhole[2], pinhole[5], pinhole[8]];
  const tilt = (DOME_PARAMS.tiltDeg * Math.PI) / 180;
  const zenithWorld = camForward.map(
    (f, k) => Math.cos(tilt) * f + Math.sin(tilt) * camUp[k]!,
  ) as Vec3;
  const project = (world: Vec3): ProjectedLabel => {
    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    projectLabel(rotateVec3ByTightMat3(output.viewFromWorld, world), output, out);
    return out;
  };

  it('the dome zenith is the camera forward pitched up by the tilt', () => {
    const inDome = rotateVec3ByTightMat3(output.viewFromWorld, zenithWorld);
    [0, 1, 0].forEach((want, k) => expect(inDome[k]).toBeCloseTo(want, 12));
  });

  it("the dome front is below the zenith in the camera's vertical plane", () => {
    const out = project(camForward);
    expect(out.visible).toBe(true);
    expect(out.px[0]).toBeCloseTo(output.centrePx[0], 6);
    expect(out.px[1]).toBeGreaterThan(output.centrePx[1]);
  });

  it('a face-centre direction lands where the resample samples it', () => {
    const faces = frameViewsAt({
      ...at,
      distanceMpc: 1e-3,
      rotations: domeFaceRotations(DOME_PARAMS.tiltDeg),
    });
    expect(faces).toHaveLength(DOME_FACES.length);
    faces.forEach((face, i) => {
      // The four side faces look exactly along the horizon, where rounding alone decides
      // `visible`: 1e-9 rad toward the zenith is inside the circle and inside the tolerance.
      const forwardWorld = orbitForwardOf(face.cam);
      const out = project(forwardWorld.map((f, k) => f + 1e-9 * zenithWorld[k]!) as Vec3);
      expect(out.visible, `face ${i}`).toBe(true);
      // `domeResample/fragment.wesl`: NDC (y up) → angle from the zenith → dome direction.
      const ndcX = (out.px[0] - output.centrePx[0]) / 1000;
      const ndcY = -(out.px[1] - output.centrePx[1]) / 1000;
      const ndcRadius = Math.hypot(ndcX, ndcY);
      const theta = (ndcRadius * Math.PI) / 2;
      const dir =
        ndcRadius === 0
          ? [0, 1, 0]
          : [
              (Math.sin(theta) * ndcX) / ndcRadius,
              Math.cos(theta),
              (-Math.sin(theta) * ndcY) / ndcRadius,
            ];
      const forward = DOME_FACES[i]!.slice(6);
      dir.forEach((got, k) => expect(Math.abs(got - forward[k]!), `face ${i}`).toBeLessThan(1e-6));
    });
  });

  it('pxScale is the dome label scale on a dome whose N/π equals the reference', () => {
    const view = {
      ...canvas!,
      canvasSize: { width: 4000, height: Math.PI * REFERENCE_PX_PER_RAD },
    };
    expect(outputProjectionOf(view, VIEW_RIGS.dome).pxScale).toBeCloseTo(DOME_LABEL_SCALE, 12);
  });
});
