/**
 * The pick keeps what the eye can ring and nothing else: the far side and craters
 * under the size cut drop, a big crater whose centre is just past the limb stays
 * (its near rim shows), off-screen craters drop, and a crowded view keeps the 128
 * largest, largest first.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import type { MoonCraterView } from '../../../../../src/layers/body/spheres/@types/MoonCraterView';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { pickMoonCraters } from '../../../../../src/layers/body/spheres/present/pickMoonCraters';

const R_KM = 1737.4;
const W = 1600;
const H = 900;

/** The eye on the +x axis `distance` radii out, looking at the centre, `fovDeg` tall. */
function view(distance: number, fovDeg = 60): MoonCraterView {
  const fov = (fovDeg * Math.PI) / 180;
  const proj = mat4.perspective(fov, W / H, 0.01, 100);
  const look = mat4.lookAt([distance, 0, 0], [0, 0, 0], [0, 0, 1]);
  return {
    eye: [distance, 0, 0],
    mvp: mat4.multiply(proj, look),
    widthPx: W,
    heightPx: H,
    pxPerRad: H / 2 / Math.tan(fov / 2),
    unitPx: 1,
  };
}

describe('pickMoonCraters', () => {
  it('drops the far side and small craters, keeps a big one just past the limb', () => {
    const rows = [
      [0, 0, 100, 1], // sub-eye, 200 km across: ~55 px at 4 radii
      [0, 180, 100, 1], // far side
      [0, 0, 10, 1], // 20 km: ~5 px, under the cut
      [0, 78, 150, 1], // centre past the 75.5° limb, rim reaching back over it
      [0, 70, 5, 1], // near the limb but tiny
    ];
    const table = moonCraterTable(rows.flat(), R_KM);
    expect(pickMoonCraters(table, view(4))).toEqual([3, 0]);
  });

  it('drops craters off the screen of a narrow view', () => {
    const table = moonCraterTable([0, 0, 40, 1, 30, 0, 40, 1], R_KM);
    expect(pickMoonCraters(table, view(1.5, 10))).toEqual([0]);
  });

  it('keeps the 128 largest, largest first', () => {
    const rows: number[] = [];
    for (let i = 0; i < 200; i++) rows.push((i % 20) * 0.01, Math.floor(i / 20) * 0.01, 50 + i, 1);
    const picked = pickMoonCraters(moonCraterTable(rows, R_KM), view(4));
    expect(picked).toHaveLength(128);
    expect(picked[0]).toBe(199);
    expect(picked[127]).toBe(72);
  });
});
