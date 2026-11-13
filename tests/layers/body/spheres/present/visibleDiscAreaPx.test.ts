/**
 * The crater budget follows the Moon's share of the frame. Near the ground a circle
 * round the projected centre lands far off (the earthrise frame read as 1% Moon and
 * got one ring); the ray grid must see the ground as about half the frame.
 */

import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import { visibleDiscAreaPx } from '../../../../../src/layers/body/spheres/present/visibleDiscAreaPx';

const W = 1600;
const H = 900;
const FOV = Math.PI / 3;

function view(
  eye: [number, number, number],
  at: [number, number, number],
  up: [number, number, number],
) {
  return {
    eye,
    mvp: mat4.multiply(mat4.perspective(FOV, W / H, 0.001, 100), mat4.lookAt(eye, at, up)),
    widthPx: W,
    heightPx: H,
    pxPerRad: H / 2 / Math.tan(FOV / 2),
    unitPx: 1,
  };
}

describe('visibleDiscAreaPx', () => {
  it('sees the ground as about half the frame from just over it, looking at the horizon', () => {
    // 100 km up, looking level-ish at the horizon (the eye's horizon dips ~19° below level).
    const r = 1 + 100 / 1737.4;
    const dip = Math.acos(1 / r);
    const area = visibleDiscAreaPx(
      view([0, 0, r], [Math.cos(dip), 0, r - Math.sin(dip)], [0, 0, 1]),
    );
    expect(area / (W * H)).toBeGreaterThan(0.4);
    expect(area / (W * H)).toBeLessThan(0.6);
  });

  it('measures a whole disc in the frame as its circle', () => {
    const area = visibleDiscAreaPx(view([4, 0, 0], [0, 0, 0], [0, 0, 1]));
    const r = (H / 2 / Math.tan(FOV / 2)) * Math.tan(Math.asin(1 / 4));
    // A 32² grid: a ~200 px disc is counted to ±15%, enough for a ring budget.
    expect(Math.abs(area / (Math.PI * r * r) - 1)).toBeLessThan(0.15);
  });
});
