import { describe, it, expect } from 'vitest';
import type { OrbitCameraInit } from '../../../src/@types/camera/OrbitCameraInit';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { createOrbitCamera } from '../../../src/utils/camera/createOrbitCamera';
import { computeViewProj } from '../../../src/utils/camera/computeViewProj';
import { frameUp } from '../../../src/utils/camera/frameUp';
import { orbitForwardOf } from '../../../src/utils/camera/orbitForwardOf';
import { symmetricFrustum } from '../../../src/utils/camera/symmetricFrustum';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';

// A non-identity frame, so a turn about world +Y instead of the frame up fails.
const BASIS = ORIENTATION_FRAMES.ecliptic;
const INIT: OrbitCameraInit = {
  target: [3, -2, 7],
  distance: 10,
  yaw: 0.8,
  // Level in the frame, so forward ⟂ frame up and a yaw offset turns it by exactly its angle.
  pitch: 0,
  roll: 0.25,
  poseBasis: BASIS,
  upBasis: BASIS,
  fovYRad: Math.PI / 4,
  aspect: 1.5,
  near: 0.1,
  far: 100,
};

function camWith(lookOffset?: Vec2) {
  return createOrbitCamera({ ...INIT, ...(lookOffset && { lookOffset }) });
}

function angleBetween(a: Vec3, b: Vec3): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

describe('orbitForwardOf', () => {
  it.each([
    [[0.3, 0] as Vec2, 0.3],
    [[0, 0.2] as Vec2, 0.2],
  ])('orbitForwardOf keeps the eye and turns forward by lookOffset %j', (offset, angle) => {
    const bare = camWith();
    const turned = camWith(offset);
    expect(turned.position).toEqual(bare.position);
    expect(angleBetween(orbitForwardOf(turned), orbitForwardOf(bare))).toBeCloseTo(angle, 12);
  });

  it('a positive pitch offset tilts the view toward the frame up', () => {
    const up = frameUp(BASIS);
    const f = orbitForwardOf(camWith([0, 0.2]));
    expect(f[0] * up[0] + f[1] * up[1] + f[2] * up[2]).toBeCloseTo(Math.sin(0.2), 12);
  });

  it('orbitForwardOf with lookOffset [0,0] is bitwise identical to absent', () => {
    const bare = camWith();
    const zero = camWith([0, 0]);
    expect(new Float64Array(orbitForwardOf(zero))).toEqual(new Float64Array(orbitForwardOf(bare)));
    const frustum = symmetricFrustum(INIT.fovYRad, INIT.aspect);
    expect(computeViewProj(zero, frustum)).toEqual(computeViewProj(bare, frustum));
  });
});
