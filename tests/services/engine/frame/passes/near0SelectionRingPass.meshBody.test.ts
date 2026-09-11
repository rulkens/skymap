/**
 * A mesh body is DRAWN through its host's metre-unit body row while the things
 * that point at it — the NEAR0 selection ring, the caption — project through
 * the NEAR0 slab in heliocentric Mpc. The three must land on one pixel wherever
 * the ring draws at all, it must survive NEAR0's near-plane floor (~6.2 m,
 * which these bodies never get outside of), and it must stand down once the
 * body overflows the screen — as it does at its own two-radii standoff.
 *
 * Built from the real seams (`deriveBodyStates` → `createOrbitCamera` →
 * `deriveSlabs` → each pass's own `draw`), so a change to any of them that
 * moves one path and not the other fails here.
 */

import { describe, it, expect, vi } from 'vitest';
import { meshBodiesPass } from '../../../../../src/services/engine/frame/passes/meshBodiesPass';
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
import { near0LabelProjection } from '../../../../../src/services/engine/frame/near0LabelProjection';
import {
  sceneBodyLabels,
  sceneBodyLabelId,
} from '../../../../../src/services/engine/presentation/sceneBodyLabels';
import { SCENE_MESH_BODIES } from '../../../../../src/data/bodies/sceneMeshBodies';
import { SCENE_BODIES } from '../../../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SelectionRow } from '../../../../../src/@types/engine/SelectionRow';
import type { BodyPoseProvider } from '../../../../../src/@types/engine/camera/BodyPoseProvider';
import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const VIEWPORT: Vec2 = [1000, 1000];
const SIM_DAYS = CONST_J2000 + 10.25;

/** Clip-space position of `p` under the column-major `m`, as [x, y, z, w]. */
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
  const bodyState = states.get(bodyId)!;
  const earth = SCENE_BODIES.find((b) => b.id === 'earth')!;
  const earthState = states.get('earth')!;

  const cam = createOrbitCamera({
    target: [bodyState.positionMpc[0], bodyState.positionMpc[1], bodyState.positionMpc[2]],
    yaw: 0.7,
    pitch: 0.2,
    distance: radiiFromCentre * body.radiusM * SCALE_UNITS.M_TO_MPC,
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
    cosmoVp: computeViewProj(cam),
    pivotRadiusMpc: body.radiusM * SCALE_UNITS.M_TO_MPC,
    pose: bodyPose,
    visibleBodies: [earth],
    viewportPx: VIEWPORT,
    starSphereRangeM: null,
    attachedBodiesByHostId: new Map([
      [
        'earth',
        SCENE_MESH_BODIES.map((m) => ({
          posM: bodyStateInHostFrame(states.get(m.id)!, earthState).posM,
          radiusM: m.radiusM,
        })),
      ],
    ]),
  });
  const ctx = {
    simDays: SIM_DAYS,
    slabs,
    bodyPose,
    canvasSize: { width: VIEWPORT[0], height: VIEWPORT[1] },
    drawCamPos: [cam.position[0], cam.position[1], cam.position[2]] as Vec3,
    drawPxPerRad: VIEWPORT[1] / (2 * Math.tan(cam.fovYRad / 2)),
    fovYRad: cam.fovYRad,
  } as unknown as ReadyFrameContext;

  const row = {
    type: 'body',
    id: bodyId,
    label: body.label,
    positionMpc: [bodyState.positionMpc[0], bodyState.positionMpc[1], bodyState.positionMpc[2]],
    radiusM: body.radiusM,
  } as SelectionRow;
  const meshDraw = vi.fn();
  const ringDraw = vi.fn();
  const state = {
    gpu: {
      meshBodyRenderer: { hasMesh: () => true, draw: meshDraw },
      selectionRingRenderer: { draw: ringDraw },
      texturedBodyRenderer: null,
    },
    data: { bodies: { earth, planets: [], meshBodies: SCENE_MESH_BODIES } },
    selectionRows: { select: row, focus: row, hover: null },
    settings: { galaxyCatalogs: { sizePx: 2 } },
  } as unknown as EngineState;

  const hostRow = slabs.findIndex((s) => s.frame.kind === 'body-m' && s.frame.bodyId === 'earth');
  meshBodiesPass.draw({} as never, slabViewOf(ctx, hostRow), ctx, state);
  near0SelectionRingPass.draw({} as never, slabViewOf(ctx, NEAR0), ctx, state);

  const meshCall = meshDraw.mock.calls.find((c) => c[1] === bodyId)!;
  const ringCall = ringDraw.mock.calls[0];

  // The caption's own seam: `sceneBodyLabels`'s world position made
  // camera-relative (`produceSceneBodyCaptions`'s two lines, which need the
  // settings/fade graph this harness has no use for) projected through
  // `near0LabelProjection`'s rebased vp — the pair `foregroundLabelsPass`, the
  // leader line and `labelPickQuads` all consume.
  const caption = sceneBodyLabels(states).find((l) => l.id === sceneBodyLabelId(bodyId))!;
  const camRelAnchor: Vec3 = [
    caption.worldPos[0] - ctx.drawCamPos[0],
    caption.worldPos[1] - ctx.drawCamPos[1],
    caption.worldPos[2] - ctx.drawCamPos[2],
  ];

  return {
    // The mesh's origin under its own MVP (the first 16 floats of the packed
    // uniforms) — where the body is actually drawn.
    meshClip: clipOf((meshCall[2] as Float32Array).subarray(0, 16), [0, 0, 0]),
    ringCall: ringCall as [unknown, Float32Array, unknown, { worldPos: Vec3; alpha: number }],
    captionClip: clipOf(near0LabelProjection(ctx).vpF32, camRelAnchor),
  };
}

/** Offset, in pixels, between two clip-space positions on this viewport. */
function offsetPx(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(
    ((a[0]! / a[3]! - b[0]! / b[3]!) * VIEWPORT[0]) / 2,
    ((a[1]! / a[3]! - b[1]! / b[3]!) * VIEWPORT[1]) / 2,
  );
}

/**
 * Far enough out that the 1.5×-apparent ring fits the viewport (so the pass
 * draws at all), still inside NEAR0's MIN_NEAR_MPC floor for the pot — the
 * only window where both the projection agreement and the near pin are
 * observable at once.
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
      expect(offsetPx(clipOf(ringCall[1], ringCall[3].worldPos), meshClip)).toBeLessThan(1);
      expect(offsetPx(captionClip, meshClip)).toBeLessThan(1);
    });

    // NEAR0's near plane is floored at MIN_NEAR_MPC (~6.2 m), which the pot
    // sits deep inside at every distance it is approachable from: without the
    // pass's near pin the quad's single clip z/w fails `z <= w` and the whole
    // ring is discarded.
    it(`keeps the ${id}'s ring centre inside the NEAR0 frustum`, () => {
      const { ringCall } = drawAt(id, RING_VISIBLE_RADII);
      const ringClip = clipOf(ringCall[1], ringCall[3].worldPos);
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
      expect(drawAt(id, RING_VISIBLE_RADII).ringCall[3].alpha).toBe(1);
    });
  }
});
