/**
 * The pick keeps what the eye can ring and nothing else: the far side and craters
 * under the size cut drop, a big crater whose centre is just past the limb stays
 * (its near rim shows), off-screen craters drop, a crowded view keeps one ring per
 * 8000 units² of visible disc (named craters whose name shows first, then the largest),
 * and a close-up stops at the cap.
 */

import { describe, it, expect } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import type { MoonCraterView } from '../../../../../src/layers/body/spheres/@types/MoonCraterView';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { pickMoonCraters } from '../../../../../src/layers/body/spheres/present/pickMoonCraters';
import { visibleDiscAreaPx } from '../../../../../src/layers/body/spheres/present/visibleDiscAreaPx';
import {
  ANTIQUE_MOON_MAX_CRATERS,
  ANTIQUE_MOON_RING_AREA_UNITS,
} from '../../../../../src/layers/body/spheres/data/antiqueMoonPrint';

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
    // The limb crater, edge-on, ranks after the face-on one for all its size.
    expect(pickMoonCraters(table, view(4))).toEqual([0, 3]);
  });

  it('drops an unnamed ring whose centre lies inside a larger kept ring', () => {
    const rows = [
      [0, 0, 150, 1], // 300 km across at the sub-eye point
      [0, 2, 40, 1], // centred inside it: bubble wrap
      [0, 12, 40, 1], // beside it, centre outside
    ];
    expect(pickMoonCraters(moonCraterTable(rows.flat(), R_KM), view(4))).toEqual([0, 2]);
  });

  it('drops craters off the screen of a narrow view', () => {
    const table = moonCraterTable([0, 0, 40, 1, 30, 0, 40, 1], R_KM);
    expect(pickMoonCraters(table, view(1.5, 10))).toEqual([0]);
  });

  // n craters on a 20-wide grid `stepDeg` apart, growing in size, none inside another.
  const crowd = (n: number, stepDeg = 2, baseKm = 35, growKm = 0.1): number[] => {
    const rows: number[] = [];
    for (let i = 0; i < n; i++)
      rows.push((i % 20) * stepDeg, Math.floor(i / 20) * stepDeg, baseKm + growKm * i, 1);
    return rows;
  };

  it('spends one ring per 8000 units² of visible disc, largest first', () => {
    const v = view(4);
    const picked = pickMoonCraters(moonCraterTable(crowd(200), R_KM), v);
    expect(picked).toHaveLength(Math.round(visibleDiscAreaPx(v) / ANTIQUE_MOON_RING_AREA_UNITS));
    // The largest row first, foreshortening ranking its nearest-the-centre ring top.
    expect(Math.floor(picked[0]! / 20)).toBe(9);
  });

  it('rings a named crater whose name shows before larger ones, not one too small to name', () => {
    const picked = pickMoonCraters(moonCraterTable(crowd(200), R_KM), view(4), [
      { id: 'a', index: 3, revealPx: 10 },
      { id: 'b', index: 5, revealPx: 1e4 },
    ]);
    expect(picked[0]).toBe(3);
    expect(picked).not.toContain(5);
  });

  it('ranks a crater wider than the frame below one that fits it', () => {
    // At 1.3 radii in a 20° view the frame is ~180 km tall: the 400 km crater shows an arc.
    const table = moonCraterTable([0, 0, 200, 1, 0, 0.5, 80, 1], R_KM);
    expect(pickMoonCraters(table, view(1.3, 20))).toEqual([1, 0]);
  });

  it('stops at the cap in a close-up', () => {
    const picked = pickMoonCraters(
      moonCraterTable(crowd(400, 0.15, 1, 0.002), R_KM),
      view(1.3, 20),
    );
    expect(picked).toHaveLength(ANTIQUE_MOON_MAX_CRATERS);
  });
});
