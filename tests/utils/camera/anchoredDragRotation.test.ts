/**
 * anchoredDragRotation tests — FW-I, the drag-exactness criterion (spec §6a).
 *
 * Every FW-I case is the same round trip: build both cursor rays from the pose
 * with `cursorRayBodyLocal`, grab the point the previous ray hits, rotate, then
 * project that (body-fixed, hence unmoved) point through the analytic inverse
 * of `cursorRayBodyLocal` and demand it lands on the current pixel. A wrong
 * axis, a wrong sign, a basis left behind or an unrotated anchor all move that
 * pixel; a `cos(latitude)` term would move it at 80° and not at 0°.
 */

import { describe, it, expect } from 'vitest';
import { anchoredDragRotation } from '../../../src/utils/camera/anchoredDragRotation';
import { cursorRayBodyLocal } from '../../../src/utils/camera/cursorRayBodyLocal';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import { cross3 } from '../../../src/utils/math/cross3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import { degToRad } from '../../../src/utils/math/degToRad';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const R = 6_371_000;
const VIEWPORT: Vec2 = [800, 600];
const FOV = Math.PI / 2; // tanHalf = 1

/** Sub-pixel by six orders of magnitude — the rotation is exact, not fitted. */
const PIXEL_DIGITS = 6;

function dot3(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unitAt(lonDeg: number, latDeg: number): Vec3 {
  const lon = degToRad(lonDeg);
  const lat = degToRad(latDeg);
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

/**
 * A surface-camera pose at a standpoint, built from the ENU there: tilt is
 * measured from NADIR (0 = straight down) and heading from north toward east.
 * `right`/`up`/`forward` follow `imagePlaneBasis`'s
 * handedness (`right × up = −forward`), so these fixtures are the shape the
 * real converter produces.
 *
 * `anchorLocalM` defaults to the body centre; passing the surface point splits
 * the eye across both fields, the deep-zoom storage the drag must also rotate.
 */
function poseAt(
  lonDeg: number,
  latDeg: number,
  altM: number,
  headingDeg: number,
  tiltDeg: number,
  splitAnchor = false,
): BodyFixedPose {
  const u = unitAt(lonDeg, latDeg);
  const east = normalize3(cross3([0, 0, 1], u));
  const north = cross3(u, east);
  const h = degToRad(headingDeg);
  const t = degToRad(tiltDeg);
  const aim: Vec3 = [
    Math.cos(h) * north[0] + Math.sin(h) * east[0],
    Math.cos(h) * north[1] + Math.sin(h) * east[1],
    Math.cos(h) * north[2] + Math.sin(h) * east[2],
  ];
  const forward: Vec3 = [
    -Math.cos(t) * u[0] + Math.sin(t) * aim[0],
    -Math.cos(t) * u[1] + Math.sin(t) * aim[1],
    -Math.cos(t) * u[2] + Math.sin(t) * aim[2],
  ];
  const right = normalize3(cross3(aim, u));
  const up = cross3(right, forward);

  const eyeM = R + altM;
  return {
    bodyId: 'earth',
    anchorLocalM: splitAnchor ? [u[0] * R, u[1] * R, u[2] * R] : [0, 0, 0],
    eyeRelAnchorM: splitAnchor
      ? [u[0] * altM, u[1] * altM, u[2] * altM]
      : [u[0] * eyeM, u[1] * eyeM, u[2] * eyeM],
    basisLocal: [...right, ...up, ...forward],
  };
}

function eyeOf(pose: BodyFixedPose): Vec3 {
  const { anchorLocalM: a, eyeRelAnchorM: e } = pose;
  return [a[0] + e[0], a[1] + e[1], a[2] + e[2]];
}

/** The analytic inverse of `cursorRayBodyLocal` — CSS pixel of a body point. */
function projectToPixel(pose: BodyFixedPose, pointM: Readonly<Vec3>): Vec2 {
  const eye = eyeOf(pose);
  const b = pose.basisLocal;
  const v: Vec3 = [pointM[0] - eye[0], pointM[1] - eye[1], pointM[2] - eye[2]];
  const f = dot3(v, [b[6], b[7], b[8]]);
  const rs = dot3(v, [b[0], b[1], b[2]]) / f;
  const us = dot3(v, [b[3], b[4], b[5]]) / f;
  const tanHalf = Math.tan(FOV / 2);
  const ndcX = rs / (tanHalf * (VIEWPORT[0] / VIEWPORT[1]));
  const ndcY = us / tanHalf;
  return [((ndcX + 1) / 2) * VIEWPORT[0], ((1 - ndcY) / 2) * VIEWPORT[1]];
}

function pickPoint(ray: { originM: Vec3; dir: Vec3 }, radiusM: number): Vec3 {
  const roots = raySphereRoots(ray.originM, ray.dir, [0, 0, 0], radiusM);
  if (roots === null) throw new Error('fixture ray misses the pick sphere');
  const t = roots[0];
  return [
    ray.originM[0] + ray.dir[0] * t,
    ray.originM[1] + ray.dir[1] * t,
    ray.originM[2] + ray.dir[2] * t,
  ];
}

/** Run one drag and return the grabbed point plus the rotated pose. */
function drag(pose: BodyFixedPose, prevPixel: Vec2, currPixel: Vec2) {
  const prevRay = cursorRayBodyLocal(pose, prevPixel, VIEWPORT, FOV);
  const currRay = cursorRayBodyLocal(pose, currPixel, VIEWPORT, FOV);
  const grabbedM = pickPoint(prevRay, R);
  const next = anchoredDragRotation(pose, prevRay, currRay, R);
  if (next === null) throw new Error('fixture drag was rejected');
  return { next, grabbedM };
}

function expectGrabbedPointUnder(pose: BodyFixedPose, prevPixel: Vec2, currPixel: Vec2) {
  const { next, grabbedM } = drag(pose, prevPixel, currPixel);
  const landed = projectToPixel(next, grabbedM);
  expect(landed[0]).toBeCloseTo(currPixel[0], PIXEL_DIGITS);
  expect(landed[1]).toBeCloseTo(currPixel[1], PIXEL_DIGITS);
}

describe('anchoredDragRotation', () => {
  it('a two-ray drag at the equator puts the grabbed point back under the cursor', () => {
    const pose = poseAt(0, 0, 0.4 * R, 30, 25);
    expectGrabbedPointUnder(pose, [360, 280], [470, 350]);
  });

  it('a two-ray drag at 80° latitude puts the grabbed point back under the cursor', () => {
    // Split anchor: the eye lives in `anchorLocalM + eyeRelAnchorM`, so a
    // rotation that forgets the anchor column lands the point elsewhere.
    const pose = poseAt(40, 80, 0.25 * R, 200, 15, true);
    expectGrabbedPointUnder(pose, [430, 260], [330, 400]);
  });

  it('dragging across the pole puts the grabbed point back under the cursor', () => {
    const pose = poseAt(0, 85, R, 0, 0);
    expectGrabbedPointUnder(pose, [400, 300], [400, 390]);
  });

  it('the standpoint crosses the pole rather than stalling at it', () => {
    // Nadir at 85°N, eye at 2R, cursor pulled 0.3 NDC down-screen: the ray is
    // α = atan(0.3) = 16.699° off nadir, so the sine rule (sin γ = 2 sin α, near
    // root ⇒ obtuse γ = 144.922°) puts the pick β = 18.379° south. Carrying it
    // back to the centre pick swings the standpoint north over the pole to
    // 76.621°N on the 180° meridian.
    const { next } = drag(poseAt(0, 85, R, 0, 0), [400, 300], [400, 390]);
    const eye = eyeOf(next);
    const eyeDir = normalize3(eye);
    expect(eyeDir[0]).toBeCloseTo(-0.23139, 5);
    expect(Math.abs(eyeDir[1])).toBeLessThan(1e-12);
    expect(eyeDir[2]).toBeCloseTo(0.97286, 5);
  });

  it('the rotation carries the basis, not only the position', () => {
    const pose = poseAt(0, 0, 0.4 * R, 30, 25);
    const { next } = drag(pose, [360, 280], [470, 350]);
    const up0: Vec3 = [pose.basisLocal[3], pose.basisLocal[4], pose.basisLocal[5]];
    const up1: Vec3 = [next.basisLocal[3], next.basisLocal[4], next.basisLocal[5]];
    const right0: Vec3 = [pose.basisLocal[0], pose.basisLocal[1], pose.basisLocal[2]];
    const right1: Vec3 = [next.basisLocal[0], next.basisLocal[1], next.basisLocal[2]];

    // Left behind, the basis would still be the original vector; parallel
    // transported, it moves with the standpoint and keeps its angle to the
    // local vertical there.
    expect(dot3(up0, up1)).toBeLessThan(0.9999);
    const vertical0 = normalize3(eyeOf(pose));
    const vertical1 = normalize3(eyeOf(next));
    expect(dot3(up1, vertical1)).toBeCloseTo(dot3(up0, vertical0), 12);
    expect(dot3(right1, vertical1)).toBeCloseTo(dot3(right0, vertical0), 12);
  });

  it('a grazing ray returns null', () => {
    // Eye at 1.5R over the equator. Impact parameter b sets the incidence at
    // the near hit: |ray·normal| = sqrt(1 − (b/R)²), so b = 0.999R gives 0.0447
    // (under the threshold) and b = 0.99R gives 0.1411 (over it).
    const pose = poseAt(0, 0, 0.5 * R, 0, 0);
    const eye = eyeOf(pose);
    const rayAt = (bOverR: number) => {
      const sinT = (bOverR * R) / (1.5 * R);
      return { originM: eye, dir: [-Math.sqrt(1 - sinT * sinT), sinT, 0] as Vec3 };
    };
    const nadir = { originM: eye, dir: [-1, 0, 0] as Vec3 };

    expect(anchoredDragRotation(pose, nadir, rayAt(0.999), R)).toBeNull();
    expect(anchoredDragRotation(pose, rayAt(0.999), nadir, R)).toBeNull();
    expect(anchoredDragRotation(pose, nadir, rayAt(0.99), R)).not.toBeNull();
  });

  it('a ray that misses the frozen sphere returns null', () => {
    const pose = poseAt(0, 0, 0.5 * R, 0, 0);
    const eye = eyeOf(pose);
    const sinT = 1.2 / 1.5; // impact parameter 1.2R — outside the sphere
    const missing = { originM: eye, dir: [-Math.sqrt(1 - sinT * sinT), sinT, 0] as Vec3 };
    const nadir = { originM: eye, dir: [-1, 0, 0] as Vec3 };
    expect(anchoredDragRotation(pose, nadir, missing, R)).toBeNull();
    expect(anchoredDragRotation(pose, missing, nadir, R)).toBeNull();
  });

  it('a ray aimed away from the body returns null', () => {
    // Both roots negative: the quadratic still "hits", but the sphere is
    // behind the eye — taking that root would rotate to the antipode.
    const pose = poseAt(0, 0, 0.5 * R, 0, 0);
    const eye = eyeOf(pose);
    const skyward = { originM: eye, dir: [1, 0, 0] as Vec3 };
    const nadir = { originM: eye, dir: [-1, 0, 0] as Vec3 };
    expect(anchoredDragRotation(pose, nadir, skyward, R)).toBeNull();
  });
});
