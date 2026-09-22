/**
 * domeFaceSpecs — the dome rig's five `ViewSpec`s. The second describe below
 * is the twin ↔ render contract: a direction picked in dome coordinates,
 * carried to world space and projected through the rendered view's OWN `vp`,
 * must land at the uv `domeFaceUv` (the TS twin the WGSL resample ports)
 * says it does — the one test that catches a flipped axis or a swapped face.
 */
import { describe, it, expect, vi } from 'vitest';
import { vec4 } from 'wgpu-matrix';

import { domeFaceSpecs } from '../../../src/utils/camera/domeFaceSpecs';
import { domeFaceUv } from '../../../src/utils/dome/domeFaceUv';
import { domeBasis } from '../../../src/utils/dome/domeBasis';
import { cameraBasisWorld } from '../../../src/utils/camera/cameraBasisWorld';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';
import { viewFromCameraEye } from '../../../src/utils/camera/viewFromCameraEye';
import { orbitForwardOf } from '../../../src/utils/camera/orbitForwardOf';
import { assembleOrbitCamera } from '../../../src/services/engine/camera/assembleOrbitCamera';
import { multiply3x3 } from '../../../src/utils/math/multiply3x3';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { mat3Columns } from '../../../src/utils/math/mat3Columns';
import { DOME_FACES, DOME_FACE_COUNT } from '../../../src/data/rendering/domeFaces';
import { DOME_PARAMS } from '../../../src/data/rendering/domeParams';
import type { EngineState } from '../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../src/@types/camera/CameraProjection';

function stubCanvas(): { canvas: FrameView; layerViewOf: ReturnType<typeof vi.fn> } {
  const layerViewOf = vi.fn((_id: string, layer: number) => ({ __layer: layer }));
  const canvas = {
    canvasSize: { width: 800, height: 800 },
    snapshot: { renderTargets: { layerViewOf } },
  } as unknown as FrameView;
  return { canvas, layerViewOf };
}

describe('domeFaceSpecs', () => {
  it('returns five specs on slots 19-23, each targeting its own dome-cube layer', () => {
    const { canvas, layerViewOf } = stubCanvas();
    const specs = domeFaceSpecs(canvas, {} as EngineState);
    expect(specs).toHaveLength(DOME_FACE_COUNT);
    specs.forEach((spec, i) => {
      expect(spec.slot).toBe(DOME_PARAMS.viewSlotBase + i);
      expect(spec.kind).toBe('frame');
      expect(spec.eyeOffsetMpc).toEqual([0, 0, 0]);
      expect(spec.sizePx).toEqual(canvas.canvasSize);
      expect(spec.clipYFlip).toBeUndefined();
      expect(spec.output).toEqual({ __layer: i });
    });
    expect(layerViewOf.mock.calls.map((c) => c)).toEqual([
      ['dome-cube', 0],
      ['dome-cube', 1],
      ['dome-cube', 2],
      ['dome-cube', 3],
      ['dome-cube', 4],
    ]);
  });
});

const POSE: CameraPose = { target: [1, 2, 3], yaw: 0.3, pitch: 0.1, distance: 100, roll: 0.2 };
const PROJECTION: CameraProjection = { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 };
const C = Math.cos(0.4);
const S = Math.sin(0.4);
const BASIS: Mat3 = [C, 0, -S, 0, 1, 0, S, 0, C];

describe('domeFaceSpecs — direction projected through a face view lands where domeFaceUv says', () => {
  const cam = assembleOrbitCamera(POSE, PROJECTION, BASIS, BASIS);
  const camBasisWorld = cameraBasisWorld(orbitForwardOf(cam), cam.roll ?? 0, cam.upBasis);
  // World-from-dome: the same product `deriveView` forms per face
  // (`camBasisWorld · rotation`), one level up — dome axes in world coords.
  const domeWorldBasis = multiply3x3(camBasisWorld, domeBasis(DOME_PARAMS.tiltDeg));

  const { canvas } = stubCanvas();
  const specs = domeFaceSpecs(canvas, {} as EngineState);
  const views = specs.map((spec) => ({
    vp: computeViewProj(cam, spec.frustum, viewFromCameraEye(spec.rotation, spec.eyeOffsetMpc)),
  }));

  function checkDirection(dirDome: Readonly<Vec3>): void {
    const { face, u, v } = domeFaceUv(dirDome);
    const dirWorld = rotateVec3ByTightMat3(normalize3([...dirDome]), domeWorldBasis);
    const point: Vec3 = [
      cam.position[0] + dirWorld[0] * 100,
      cam.position[1] + dirWorld[1] * 100,
      cam.position[2] + dirWorld[2] * 100,
    ];
    const clip = vec4.transformMat4(
      [point[0], point[1], point[2], 1],
      Float64Array.from(views[face]!.vp),
    );
    const ndcX = clip[0]! / clip[3]!;
    const ndcY = clip[1]! / clip[3]!;
    expect((ndcX + 1) / 2).toBeCloseTo(u, 5);
    expect((1 - ndcY) / 2).toBeCloseTo(v, 5);
  }

  it.each(DOME_FACES.map((face, i) => [i, face] as const))(
    'face %i centre and 0.9-to-edge samples',
    (_i, face) => {
      const { right, up, forward } = mat3Columns(face);
      checkDirection(forward);
      for (const [s, t] of [
        [0.9, 0],
        [-0.9, 0],
        [0, 0.9],
        [0, -0.9],
      ] as const) {
        checkDirection([
          right[0] * s + up[0] * t + forward[0],
          right[1] * s + up[1] * t + forward[1],
          right[2] * s + up[2] * t + forward[2],
        ]);
      }
    },
  );
});
