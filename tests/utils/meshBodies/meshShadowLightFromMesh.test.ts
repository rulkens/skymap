/**
 * The mesh shadow camera and its two re-basings. A wrong sign on depth lights the sunward side
 * from behind, a box that misses the bounding sphere clips the caster, and a transpose slip in
 * the mesh-to-host or eye re-basing slides the ground shadow off the rover: none raises an error.
 */

import { describe, it, expect } from 'vitest';
import { meshShadowLightFromMesh } from '../../../src/utils/meshBodies/meshShadowLightFromMesh';
import { meshShadowLightFromLocal } from '../../../src/utils/meshBodies/meshShadowLightFromLocal';
import { meshShadowLightFromEye } from '../../../src/utils/meshBodies/meshShadowLightFromEye';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';

function transform(m: Float64Array, p: Readonly<Vec3>): Vec3 {
  return [0, 1, 2].map(
    (r) => m[r]! * p[0] + m[4 + r]! * p[1] + m[8 + r]! * p[2] + m[12 + r]!,
  ) as Vec3;
}

const R = 3.5;
// One sun off the poles, one near +z: the basis switches its reference axis between them.
const SUNS: readonly Vec3[] = [normalize3([0.3, -0.8, 0.5]), normalize3([0.05, 0.02, 0.99])];

describe('meshShadowLightFromMesh', () => {
  it('a point on the sunward side lies nearer the light than one behind', () => {
    for (const sun of SUNS) {
      const light = meshShadowLightFromMesh(sun, R);
      const front = transform(light, [sun[0] * 2, sun[1] * 2, sun[2] * 2]);
      const back = transform(light, [-sun[0] * 2, -sun[1] * 2, -sun[2] * 2]);
      expect(front[2]).toBeLessThan(back[2]);
    }
  });

  it('fits the bounding sphere: xy in [-1, 1], depth in [0, 1]', () => {
    for (const sun of SUNS) {
      const light = meshShadowLightFromMesh(sun, R);
      for (let i = 0; i < 200; i++) {
        const theta = Math.acos(1 - (2 * (i + 0.5)) / 200);
        const phi = i * 2.399963;
        const p: Vec3 = [
          R * Math.sin(theta) * Math.cos(phi),
          R * Math.sin(theta) * Math.sin(phi),
          R * Math.cos(theta),
        ];
        const [x, y, z] = transform(light, p);
        expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-12);
        expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-12);
        expect(z).toBeGreaterThanOrEqual(-1e-12);
        expect(z).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });
});

describe('meshShadowLightFromEye', () => {
  it('maps a point given from the eye where lightFromMesh maps the same mesh point', () => {
    // A 90° turn about z, then x: not its own transpose, so a transpose slip shows.
    const rotM: Mat3 = [0, 1, 0, 0, 0, 1, 1, 0, 0];
    const posM: Vec3 = [3_389_500, -1200.5, 640.25];
    const eyeRelBodyM: Vec3 = [3_389_510, -1190, 645];
    const lightFromMesh = meshShadowLightFromMesh(SUNS[0]!, R);
    const meshPoint: Vec3 = [0.7, -1.1, 0.4];
    // Host-axis point: posM + rotM · meshPoint (column-major rotM).
    const hostPoint: Vec3 = [0, 1, 2].map(
      (r) =>
        posM[r]! +
        rotM[r]! * meshPoint[0] +
        rotM[3 + r]! * meshPoint[1] +
        rotM[6 + r]! * meshPoint[2],
    ) as Vec3;
    const fromEye: Vec3 = [
      hostPoint[0] - eyeRelBodyM[0],
      hostPoint[1] - eyeRelBodyM[1],
      hostPoint[2] - eyeRelBodyM[2],
    ];
    const lightFromEye = meshShadowLightFromEye(
      meshShadowLightFromLocal(lightFromMesh, rotM),
      eyeRelBodyM,
      posM,
    );
    const expected = transform(lightFromMesh, meshPoint);
    transform(lightFromEye, fromEye).forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 7));
  });
});
