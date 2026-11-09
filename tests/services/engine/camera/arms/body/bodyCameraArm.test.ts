/**
 * bodyCameraArm.host's `groundRadiusAtM` closure — the ground-collision row's
 * source (F3a, spec §8.3). What can fail here is silent: a swapped operand or
 * a hardcoded body id reads a plausible but wrong number, never an error. And
 * the floor press: only a zoom-in that starts on the floor reports it.
 */

import { describe, it, expect } from 'vitest';

import { bodyCameraArm } from '../../../../../../src/services/engine/camera/arms/body/bodyCameraArm';
import { deriveBodyStates } from '../../../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_CELESTIAL_BODIES } from '../../../../../../src/data/bodies/sceneCelestialBodies';
import { ORIENTATION_FRAMES } from '../../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../../src/data/time/constJ2000';
import { findByIdOrThrow } from '../../../../../../src/utils/object/findByIdOrThrow';
import type { SceneBodyId } from '../../../../../../src/@types/scene/SceneBodyId';
import type { CameraArmBasisCtx } from '../../../../../../src/@types/camera/arms/CameraArmBasisCtx';
import type { TerrainHeightAtLookup } from '../../../../../../src/@types/camera/terrain/TerrainHeightAtLookup';
import { asSceneBodyId } from '../../../../../../src/utils/scene/asSceneBodyId';
import { EMPTY_SURFACE_GESTURE_MEMORY } from '../../../../../../src/services/engine/camera/arms/body/gesture/surfaceStep';
import { EMPTY_TILT_MEMORY } from '../../../../../../src/services/engine/camera/data/emptyTiltMemory';
import { surfaceFloorM } from '../../../../../../src/services/engine/camera/arms/body/utils/surfaceFloorM';
import { SURFACE_STANDOFF_RADII } from '../../../../../../src/utils/camera/orbitCamera/clampDistance';
import { pivotFraming } from '../../../../../../src/services/engine/camera/framing/pivotRadiusMpc';
import { symmetricFrustum } from '../../../../../../src/utils/camera/frustum/symmetricFrustum';
import { DEFAULT_CAMERA_TUNING } from '../../../../../../src/data/camera/cameraTuning';
import { datumOnlyTerrainHeight } from '../../../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { bodyFixedEyeM } from '../../../../../../src/utils/camera/surfaceFrame/bodyFixedEyeM';
import { normalize3 } from '../../../../../../src/utils/math/normalize3';
import { skySpotRadial } from '../../../../../../src/utils/geo/skySpotRadial';
import { earthArm } from '../../../../../fixtures/earthArm';
import { cursorRayBodyLocal } from '../../../../../../src/utils/camera/terrain/cursorRayBodyLocal';
import { raySphereRoots } from '../../../../../../src/utils/math/raySphereRoots';
import type { Vec2 } from '../../../../../../src/@types/math/Vec2';
import type { CameraArmCtx } from '../../../../../../src/@types/camera/arms/CameraArmCtx';
import type { FramedPose } from '../../../../../../src/@types/camera/pose/FramedPose';
import type { InputStep } from '../../../../../../src/@types/camera/input/InputStep';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000);
const EARTH_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'bodyCameraArm.test').surface
  .datumRadiusM;
const MARS_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'mars', 'bodyCameraArm.test').surface
  .datumRadiusM;
const MARS_ID = asSceneBodyId('mars');
const EARTH_ID = asSceneBodyId('earth');

function ctxWith(terrainHeightAt: TerrainHeightAtLookup): CameraArmBasisCtx {
  return { bodies: BODIES, poseBasis: B, upBasis: B, terrainHeightAt };
}

describe("bodyCameraArm.host's groundRadiusAtM", () => {
  it('queries the lookup with the host it was built for, not a fixed body id', () => {
    const seen: SceneBodyId[] = [];
    const terrainHeightAt: TerrainHeightAtLookup = (bodyId) => {
      seen.push(bodyId);
      return bodyId === MARS_ID ? 42 : 0;
    };
    const earthHost = bodyCameraArm.host({ body: EARTH_ID }, ctxWith(terrainHeightAt))!;
    const marsHost = bodyCameraArm.host({ body: MARS_ID }, ctxWith(terrainHeightAt))!;
    expect(earthHost.groundRadiusAtM([1, 0, 0])).toBe(EARTH_R_M);
    expect(marsHost.groundRadiusAtM([1, 0, 0])).toBeCloseTo(MARS_R_M + 42, 9);
    expect(seen).toEqual([EARTH_ID, MARS_ID]);
  });
});

describe("bodyCameraArm.host's relief shells", () => {
  // Asserted against the DECLARED relief, not against the two helpers that
  // compute them — a swapped pair type-checks clean and would make a ray pick
  // march between the wrong two spheres, silently.
  it('brackets the datum with the body’s own declared relief', () => {
    const earth = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'earth', 'bodyCameraArm.test').surface;
    const host = bodyCameraArm.host(
      { body: EARTH_ID },
      ctxWith(() => 0),
    )!;
    expect(earth.reliefM[0]).toBeLessThan(0);
    expect(host.innerBoundRadiusM).toBe(EARTH_R_M + earth.reliefM[0]);
    expect(host.outerBoundRadiusM).toBe(EARTH_R_M + earth.reliefM[1]);
    expect(host.innerBoundRadiusM).toBeLessThan(host.radiusM);
    expect(host.radiusM).toBeLessThan(host.outerBoundRadiusM);
  });
});

describe('the body arm’s floor push', () => {
  const ctx: CameraArmCtx = {
    ...ctxWith(datumOnlyTerrainHeight),
    focusBodyId: null,
    bodilessFocus: false,
    pivot: pivotFraming(null),
    viewportPx: [100, 100],
    frustum: symmetricFrustum(Math.PI / 3, 1),
    fovYRad: Math.PI / 3,
    tuning: DEFAULT_CAMERA_TUNING,
  };
  const floorM = surfaceFloorM(EARTH_R_M, SURFACE_STANDOFF_RADII);
  /** Earth's body arm looking at the centre, its eye `aboveFloorM` over the descent floor. */
  const standing = (aboveFloorM: number): FramedPose<'body'> => {
    const { pose } = earthArm(2) as FramedPose<'body'>;
    const eye = bodyFixedEyeM(pose);
    const s = (floorM + aboveFloorM) / Math.hypot(...eye);
    const a = pose.anchorLocalM;
    return {
      frame: { body: EARTH_ID },
      pose: { ...pose, eyeRelAnchorM: [eye[0] * s - a[0], eye[1] * s - a[1], eye[2] * s - a[2]] },
    };
  };
  /** Off the optical centre, so an anchor taken at the centre would be metres away. */
  const CURSOR_PX: Vec2 = [80, 30];
  const notch = (factor: number): InputStep => ({
    kind: 'zoom',
    factor,
    duringGesture: false,
    cursorPx: CURSOR_PX,
  });
  const pushOf = (framed: FramedPose<'body'>, input: InputStep) =>
    bodyCameraArm.step(EMPTY_SURFACE_GESTURE_MEMORY, EMPTY_TILT_MEMORY, framed, input, ctx).pushed;

  it('a zoom-in that starts at the floor reports edge in at the cursor anchor', () => {
    const framed = standing(0);
    const pushed = pushOf(framed, notch(0.8));
    if (pushed?.edge !== 'in') throw new Error('expected a floor push');
    // Where the cursor pixel's ray meets the (datum-only) ground.
    const ray = cursorRayBodyLocal(framed.pose, CURSOR_PX, ctx.viewportPx, ctx.frustum);
    const t = raySphereRoots(ray.originM, ray.dir, [0, 0, 0], EARTH_R_M)![0];
    const underCursor = [0, 1, 2].map((i) => ray.originM[i]! + ray.dir[i]! * t);
    const nadir = normalize3(bodyFixedEyeM(framed.pose)).map((c) => c * EARTH_R_M);
    const gap = (p: readonly number[]) =>
      Math.hypot(...p.map((c, i) => c - pushed.pointLocalM[i]!));
    expect(gap(underCursor)).toBeLessThan(0.5);
    expect(gap(nadir)).toBeGreaterThan(2);
    expect(pushed.spot.body).toBe(EARTH_ID);
    const radial = skySpotRadial(pushed.spot);
    const along = normalize3(pushed.pointLocalM);
    for (let i = 0; i < 3; i++) expect(radial[i]).toBeCloseTo(along[i]!, 9);
  });

  it('a zoom-in that starts above the floor reports nothing', () => {
    expect(pushOf(standing(1), notch(0.8))).toBeUndefined();
  });

  it('a zoom-out at the floor reports nothing', () => {
    expect(pushOf(standing(0), notch(1.25))).toBeUndefined();
  });
});
