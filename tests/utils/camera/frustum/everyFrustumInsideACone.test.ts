import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { frustumPlanesFromViewProj } from '../../../../src/utils/camera/frustum/frustumPlanesFromViewProj';
import { everyFrustumInsideACone } from '../../../../src/utils/camera/frustum/everyFrustumInsideACone';
import { occluderConesFrom } from '../../../../src/utils/occlusion/occluderConesFrom';

// A 30° half-angle body straight down +x.
const cones = occluderConesFrom(
  [{ positionMpc: [10, 0, 0], radiusM: 5 / SCALE_UNITS.M_TO_MPC, outerRadiusM: 0 }],
  [0, 0, 0],
);
const viewPlanes = (fovDeg: number, aspect: number, look: [number, number, number]) =>
  frustumPlanesFromViewProj(
    mat4.multiply(
      mat4.perspective((fovDeg * Math.PI) / 180, aspect, 0.01, 1e5),
      mat4.lookAt([0, 0, 0], look, [0, 0, 1]),
    ),
  );
const views = (...planes: Float32Array[]) => {
  const out = new Float32Array(planes.length * 24);
  planes.forEach((p, i) => out.set(p, i * 24));
  return out;
};

describe('everyFrustumInsideACone', () => {
  it('a narrow view on the body is hidden', () => {
    expect(everyFrustumInsideACone(viewPlanes(0.5, 1.6, [1, 0, 0]), cones)).toBe(true);
  });

  it('a view whose corners reach past the limb is not', () => {
    // 40° tall at 1.6:1: the corners sit ~34° off-axis; 30° at 1.2:1 keeps them inside 30°.
    expect(everyFrustumInsideACone(viewPlanes(40, 1.6, [1, 0, 0]), cones)).toBe(false);
    expect(everyFrustumInsideACone(viewPlanes(30, 1.2, [1, 0, 0]), cones)).toBe(true);
  });

  it('a narrow view looking away is not', () => {
    expect(everyFrustumInsideACone(viewPlanes(0.5, 1, [-1, 0, 0]), cones)).toBe(false);
  });

  it('needs every view hidden', () => {
    const onBody = viewPlanes(0.5, 1, [1, 0, 0]);
    expect(everyFrustumInsideACone(views(onBody, onBody), cones)).toBe(true);
    expect(everyFrustumInsideACone(views(onBody, viewPlanes(0.5, 1, [0, 1, 0])), cones)).toBe(
      false,
    );
  });

  it('no views or no cones hide nothing', () => {
    expect(everyFrustumInsideACone(new Float32Array(0), cones)).toBe(false);
    expect(everyFrustumInsideACone(viewPlanes(0.5, 1, [1, 0, 0]), new Float64Array(0))).toBe(false);
  });
});
