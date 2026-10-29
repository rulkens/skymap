/**
 * A mesh body is DRAWN through its host's metre-unit body row while the things that point at
 * it (the NEAR0 selection ring, the caption) project through the NEAR0 slab in heliocentric
 * Mpc. The three must land on one pixel wherever the ring draws, the ring's centre must stay
 * inside the NEAR0 frustum, and it must stand down once the body overflows the screen, as it
 * does at its own two-radii standoff. Built from the real seams, so a change that moves one
 * path and not the other fails here.
 */

import { positionedBodiesOf } from '../../../../helpers/frame/positionedBodiesOf';
import { describe, it, expect, vi } from 'vitest';
import { missionMeshesPass } from '../../../../../src/layers/missions/passes/missionMeshesPass';
import { near0SelectionRingPass } from '../../../../../src/services/engine/frame/passes/near0SelectionRingPass';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { deriveSlabs, slabViewOf, NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { createOrbitCamera } from '../../../../../src/utils/camera/createOrbitCamera';
import { computeViewProj } from '../../../../../src/utils/camera/computeViewProj';
import { imagePlaneBasis } from '../../../../../src/utils/camera/imagePlaneBasis';
import { frameUp } from '../../../../../src/utils/camera/frameUp';
import { normalize3 } from '../../../../../src/utils/math/normalize3';
import { mat3FromColumns } from '../../../../../src/utils/math/mat3FromColumns';
import { bodyRelativePose } from '../../../../../src/services/engine/camera/bodyRelativePose';
import { bodyStateInHostFrame } from '../../../../../src/utils/scene/bodyStateInHostFrame';
import { bodyLayerSlabRow } from '../../../../../src/layers/body/present/bodyLayerSlabRow';
import { near0LabelProjection } from '../../../../../src/services/engine/frame/near0LabelProjection';
import { meshBodyCaption } from '../../../../../src/utils/labels/meshBodyCaption';
import { SCENE_MESH_BODIES } from '../../../../../src/data/bodies/sceneMeshBodies';
import { SCENE_BODIES } from '../../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../../src/@types/engine/frame/FrameView';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { BodyPoseProvider } from '../../../../../src/@types/engine/camera/BodyPoseProvider';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../../../src/utils/camera/symmetricFrustum';
import { bodyDriverGeometry } from '../../../../../src/utils/scene/bodyDriverGeometry';
import { asSceneBodyId } from '../../../../../src/utils/scene/asSceneBodyId';

const VIEWPORT: Vec2 = [1000, 1000];
const SIM_DAYS = CONST_J2000 + 10.25;

function clipOf(m: Float32Array, p: Readonly<Vec3>): [number, number, number, number] {
  return [0, 1, 2, 3].map(
    (r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!,
  ) as [number, number, number, number];
}

/**
 * The camera parked `radiiFromCentre` body radii out, looking at it, with
 * Earth's body row present. Two poses matter: the body's own standoff
 * (`standoffRadii` = 2), where the subject overflows the viewport, and
 * `RING_VISIBLE_RADII`, where it does not. Returns what each pass handed its
 * renderer — `ringCall` undefined when the ring pass drew nothing.
 */
function drawAt(bodyId: string, radiiFromCentre: number) {
  const states = deriveBodyStates(SIM_DAYS);
  const body = SCENE_MESH_BODIES.find((b) => b.id === bodyId)!;
  const bodyState = states.get(asSceneBodyId(bodyId))!;
  const earth = SCENE_BODIES.find((b) => b.id === 'earth')!;
  const earthState = states.get(asSceneBodyId('earth'))!;

  const cam = createOrbitCamera({
    target: [bodyState.positionMpc[0], bodyState.positionMpc[1], bodyState.positionMpc[2]],
    yaw: 0.7,
    pitch: 0.2,
    distance: radiiFromCentre * body.boundingRadiusM * SCALE_UNITS.M_TO_MPC,
    fovYRad: 1,
    aspect: 1,
    near: 0.1,
    far: 10000,
  });
  const camForward = normalize3([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);
  const { right, up } = imagePlaneBasis(camForward, cam.roll ?? 0, frameUp(cam.upBasis));
  const camBasisWorld = mat3FromColumns(right, up, camForward);
  const bodyPose: BodyPoseProvider = (id) => {
    const s = states.get(id);
    return s === undefined
      ? null
      : bodyRelativePose({ camPosMpc: cam.position, camBasisWorld, bodyState: s });
  };

  const slabs = deriveSlabs({
    cam,
    frustum: symmetricFrustum(cam.fovYRad, cam.aspect),
    cosmoVp: computeViewProj(cam, symmetricFrustum(cam.fovYRad, cam.aspect)),
    altitudeMpc: (radiiFromCentre - 1) * body.boundingRadiusM * SCALE_UNITS.M_TO_MPC,
    pose: bodyPose,
    visibleRows: [earth].map(bodyLayerSlabRow),
    viewportPx: VIEWPORT,
    starSphereRangeM: null,
    attachedBodiesByHostId: new Map([
      [
        'earth',
        SCENE_MESH_BODIES.map((m) => ({
          posM: bodyStateInHostFrame(states.get(m.id)!, earthState).posM,
          radiusM: m.boundingRadiusM,
        })),
      ],
    ]),
  });
  const ctx = {
    snapshot: {
      meshBodies: SCENE_MESH_BODIES,
      sceneBodies: positionedBodiesOf(SCENE_MESH_BODIES, states),
      simDays: SIM_DAYS,
      // No body row has drawn into `foreground:0` in this fixture, so the
      // ring takes its un-occluded pipeline — the axis these cases are about.
      renderedTargets: new Set<string>(),
    },
    slabs,
    bodyPose,
    canvasSize: { width: VIEWPORT[0], height: VIEWPORT[1] },
    drawCamPos: [cam.position[0], cam.position[1], cam.position[2]] as Vec3,
    drawPxPerRad: VIEWPORT[1] / (2 * Math.tan(cam.fovYRad / 2)),
  } as unknown as FrameView;

  const row = {
    type: 'craft',
    id: bodyId,
    label: body.label,
    positionMpc: [bodyState.positionMpc[0], bodyState.positionMpc[1], bodyState.positionMpc[2]],
    driver: bodyDriverGeometry(bodyId),
  } as SelectionRow;
  const meshDraw = vi.fn();
  const ringDraw = vi.fn();
  const state = {
    gpu: {
      meshBodyRenderer: { hasMesh: () => true, draw: meshDraw },
      selectionRingRenderer: { draw: ringDraw },
    },
    selectionRows: { select: row, focus: row, hover: null },
    settings: { galaxyCatalogs: { sizePx: 2 } },
  } as unknown as EngineState;

  const hostRow = slabs.findIndex((s) => s.frame.kind === 'body-m' && s.frame.hostId === 'earth');
  missionMeshesPass.draw({} as never, slabViewOf(ctx, hostRow), ctx, state);
  near0SelectionRingPass.draw({} as never, slabViewOf(ctx, NEAR0), ctx, state);

  const meshCall = meshDraw.mock.calls.find((c) => c[1] === bodyId)!;
  const ringCall = ringDraw.mock.calls[0];

  // The caption's own seam: `meshBodyCaption`'s world position made
  // camera-relative (`produceMissionCaptions`'s compose, which needs the
  // settings/fade graph this harness has no use for) projected through
  // `near0LabelProjection`'s rebased vp — the pair `labelsNearPass`, the
  // leader line and `labelPickQuads` all consume.
  const caption = meshBodyCaption(body, bodyState.positionMpc, 0);
  const camRelAnchor: Vec3 = [
    caption.worldPos[0] - ctx.drawCamPos[0],
    caption.worldPos[1] - ctx.drawCamPos[1],
    caption.worldPos[2] - ctx.drawCamPos[2],
  ];

  return {
    meshClip: clipOf((meshCall[2] as Float32Array).subarray(0, 16), [0, 0, 0]),
    ringCall: ringCall as [
      unknown,
      Float32Array,
      unknown,
      unknown,
      { worldPos: Vec3; alpha: number },
    ],
    captionClip: clipOf(near0LabelProjection(ctx).vpF32, camRelAnchor),
  };
}

function offsetPx(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(
    ((a[0]! / a[3]! - b[0]! / b[3]!) * VIEWPORT[0]) / 2,
    ((a[1]! / a[3]! - b[1]! / b[3]!) * VIEWPORT[1]) / 2,
  );
}

/**
 * Far enough out that the 1.5×-apparent ring fits the viewport, so the pass
 * draws at all. The near pin itself is `pinInsideNearPlane.test.ts`'s: NEAR0's
 * ~0.5 m floor sits inside every distance a ring is visible from.
 */
const RING_VISIBLE_RADII = 6;

describe('near0SelectionRingPass over a mesh body', () => {
  for (const id of ['petunias', 'whale']) {
    // The ring and the caption reach the screen through the NEAR0 slab in
    // heliocentric Mpc; the mesh reaches it through its host's metre-unit body
    // row. Both must land on the same pixel — at 1 AU an f64 ulp is 25 µm, so
    // any real divergence here is a broken seam, not rounding.
    it(`centres the ${id}'s ring and caption on the pixel the mesh draws its origin at`, () => {
      const { meshClip, ringCall, captionClip } = drawAt(id, RING_VISIBLE_RADII);
      expect(offsetPx(clipOf(ringCall[1], ringCall[4].worldPos), meshClip)).toBeLessThan(1);
      expect(offsetPx(captionClip, meshClip)).toBeLessThan(1);
    });

    // One clip z/w serves the whole quad, so a centre outside either NEAR0
    // plane would discard the ring entirely.
    it(`keeps the ${id}'s ring centre inside the NEAR0 frustum`, () => {
      const { ringCall } = drawAt(id, RING_VISIBLE_RADII);
      const ringClip = clipOf(ringCall[1], ringCall[4].worldPos);
      expect(ringClip[2]).toBeGreaterThanOrEqual(0);
      expect(ringClip[2]).toBeLessThanOrEqual(ringClip[3]);
    });

    // At the standoff the body's apparent diameter is 915 px on a 1000 px
    // viewport, so the 1.5× ring is a stray arc crossing two screen edges
    // rather than a halo. The pass drops it entirely instead of uploading
    // uniforms for a fully transparent draw.
    it(`draws no ring at the ${id}'s own standoff, where the body overflows the screen`, () => {
      const body = SCENE_MESH_BODIES.find((b) => b.id === id)!;
      expect(drawAt(id, body.standoffRadii).ringCall).toBeUndefined();
      expect(drawAt(id, RING_VISIBLE_RADII).ringCall[4].alpha).toBe(1);
    });
  }
});
