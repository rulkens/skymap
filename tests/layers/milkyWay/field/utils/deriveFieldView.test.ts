import { describe, expect, it } from 'vitest';
import { mat4, vec3n, vec4 } from 'wgpu-matrix';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { FieldView } from '../../../../../src/layers/milkyWay/field/@types/FieldView';
import { deriveFieldView } from '../../../../../src/layers/milkyWay/field/utils/deriveFieldView';
import { milkyWayCamPosModel } from '../../../../../src/layers/milkyWay/cloud/render/milkyWayCamPosModel';
import { milkyWayInverseModelCached } from '../../../../../src/layers/milkyWay/cloud/render/milkyWayInverseModelCached';
import { milkyWayModelCached } from '../../../../../src/layers/milkyWay/cloud/render/milkyWayModelCached';
import { shiftedFrustum } from '../../../../../src/services/engine/camera/lens/utils/shiftedFrustum';
import { computeViewProj } from '../../../../../src/utils/camera/projection/computeViewProj';
import { createOrbitCamera } from '../../../../../src/utils/camera/orbitCamera/createOrbitCamera';
import { deriveView } from '../../../../../src/services/engine/frame/deriveView';
import { domeFaceRotations } from '../../../../../src/utils/dome/domeFaceRotations';
import { DOME_PARAMS } from '../../../../../src/data/rendering/domeParams';
import { symmetricFrustum } from '../../../../../src/utils/camera/frustum/symmetricFrustum';
import { frameViewsAt } from '../../../../helpers/frame/frameViewsAt';

const NDCS: readonly [number, number][] = [
  [-1, -1],
  [1, 1],
  [0.25, 0.6],
];

function frameFixture(): FrameView {
  const cam = createOrbitCamera({
    target: [0.01, -0.004, 0.02],
    distance: 0.05,
    yaw: 0.7,
    pitch: 0.3,
    roll: 0.4,
    fovYRad: 0.8,
    aspect: 16 / 9,
    near: 1e-4,
    far: 10,
  });
  const frustum = shiftedFrustum(0.8, 16 / 9, [0.3, -0.2]);
  const view: Pick<FrameView, 'cam' | 'frustum' | 'vp' | 'drawCamPos'> = {
    cam,
    frustum,
    vp: computeViewProj(cam, frustum),
    drawCamPos: [cam.position[0], cam.position[1], cam.position[2]],
  };
  return view as FrameView;
}

/** The ray direction through `ndc`, built the way the field shaders build it. */
function rayDir(view: FieldView, [x, y]: readonly [number, number]): Vec3 {
  const { tanLeft, tanRight, tanDown, tanUp } = view.frustum;
  const tx = (tanLeft + tanRight) / 2 + (x * (tanRight - tanLeft)) / 2;
  const ty = (tanDown + tanUp) / 2 + (y * (tanUp - tanDown)) / 2;
  const { fwd, right, up } = view;
  return [0, 1, 2].map((i) => fwd[i]! + right[i]! * tx + up[i]! * ty) as Vec3;
}

function expectRaysLandOnNdc(view: FieldView, vp: FrameView['vp']): void {
  for (const ndc of NDCS) {
    const d = rayDir(view, ndc);
    const p = [0, 1, 2].map((i) => view.eye[i]! + 0.005 * d[i]!);
    const clip = vec4.transformMat4([p[0]!, p[1]!, p[2]!, 1], Float64Array.from(vp));
    expect(clip[0]! / clip[3]!).toBeCloseTo(ndc[0], 5);
    expect(clip[1]! / clip[3]!).toBeCloseTo(ndc[1], 5);
  }
}

describe('deriveFieldView', () => {
  it('with the identity, rays built from the FieldView land on their own NDC under frame.vp', () => {
    const frame = frameFixture();
    const view = deriveFieldView(frame, mat4.identity());

    expect(view.eye).toEqual(frame.drawCamPos);
    expect(view.frustum).toBe(frame.frustum);
    expectRaysLandOnNdc(view, frame.vp);
  });

  it("a dome face's FieldView carries that face's basis and frustum, not the main view's", () => {
    // Each rig view is its own submit, so the field follows the view it is handed.
    const [canvas] = frameViewsAt({
      eyeMpc: [0.01, -0.004, 0.02],
      forward: [1, 0.3, 0.2],
      distanceMpc: 0.05,
    });
    const face = deriveView(canvas!.snapshot, canvas!.cam, {
      id: 'dome:test',
      rotation: domeFaceRotations(DOME_PARAMS.tiltDeg)[1]!,
      eyeOffsetMpc: [0, 0, 0],
      frustum: symmetricFrustum(Math.PI / 2, 1),
      sizePx: { width: 512, height: 512 },
      slot: DOME_PARAMS.viewSlotBase + 1,
      kind: 'frame',
    });
    const main = deriveFieldView(canvas!, mat4.identity());
    const view = deriveFieldView(face, mat4.identity());

    expect(view.frustum).toBe(face.frustum);
    expect(view.frustum).not.toEqual(main.frustum);
    expect(vec3n.dot(view.fwd, main.fwd)).toBeLessThan(0.99);
    expectRaysLandOnNdc(view, face.vp);
  });

  it("in the galaxy frame, the eye is milkyWayCamPosModel's and rays stay parallel", () => {
    const frame = frameFixture();
    const world = deriveFieldView(frame, mat4.identity());
    const galaxy = deriveFieldView(frame, milkyWayInverseModelCached());

    // milkyWayCamPosModel returns f32-rounded components; deriveFieldView stays f64.
    const expected = milkyWayCamPosModel(frame.drawCamPos);
    const scale = Math.hypot(...expected);
    for (let i = 0; i < 3; i++)
      expect(Math.abs(galaxy.eye[i]! - expected[i]!)).toBeLessThan(1e-6 * scale);

    for (const ndc of NDCS) {
      const back = vec3n.normalize(
        vec3n.transformMat4Upper3x3(rayDir(galaxy, ndc), milkyWayModelCached()),
      );
      const ref = vec3n.normalize(rayDir(world, ndc));
      expect(vec3n.length(vec3n.cross(back, ref))).toBeLessThan(1e-6);
      expect(vec3n.dot(back, ref)).toBeGreaterThan(0);
    }
  });
});
