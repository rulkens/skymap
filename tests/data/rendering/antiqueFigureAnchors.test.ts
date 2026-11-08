/**
 * ANTIQUE_FIGURE_ANCHORS — every Hevelius figure, placed by the plate, must print
 * each anchor star's symbol on that star, in a view square on the figure, a
 * rolled one, one whose axis is well off it and a phone's: a mirrored sprite, a
 * plate whose up is not north or a misread symbol all miss by many degrees.
 */

import { describe, it, expect } from 'vitest';

import { ANTIQUE_ORNAMENTS } from '../../../src/data/rendering/antiqueOrnaments';
import { ANTIQUE_ORNAMENT_ATLAS } from '../../../src/data/rendering/antiqueOrnamentAtlas';
import { placeAntiqueOrnaments } from '../../../src/utils/gpu/antiqueLook/placeAntiqueOrnaments';
import { rayOfPx } from '../../../src/utils/camera/projection/viewProjection/rayOfPx';
import { dot3 } from '../../../src/utils/math/dot3';
import { raDecDistToCartesian } from '../../../src/utils/math/raDecDistToCartesian';
import { cross3 } from '../../../src/utils/math/cross3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { ViewProjection } from '../../../src/@types/camera/projection/ViewProjection';
import type { AntiqueOrnamentInstance } from '../../../src/@types/rendering/AntiqueOrnamentInstance';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Hevelius' own star places are good to about a degree; past 2° the figure visibly
// misses. Off the view's axis a pinhole stretches the sky unevenly, which a turned
// rectangle cannot follow, so there the bar is 3°: the faults it guards are 8° and more.
const DEG = Math.PI / 180;

const VIEWS = [
  {
    name: 'square on it',
    offDeg: 0,
    rollDeg: 0,
    size: { width: 1600, height: 900 },
    toleranceDeg: 2,
  },
  { name: 'rolled', offDeg: 0, rollDeg: 70, size: { width: 1600, height: 900 }, toleranceDeg: 2 },
  {
    name: 'axis 20° off it',
    offDeg: 20,
    rollDeg: 0,
    size: { width: 1600, height: 900 },
    toleranceDeg: 3,
  },
  { name: 'phone', offDeg: 0, rollDeg: 0, size: { width: 800, height: 1700 }, toleranceDeg: 2 },
];

/** A pinhole looking `offDeg` east of `centre`, rolled `rollDeg`, its short side ~70° wide. */
function viewOf(centre: Vec3, view: (typeof VIEWS)[number]): ViewProjection {
  const east = normalize3(cross3([0, 0, 1], centre));
  const a = view.offDeg * DEG;
  const forward = normalize3(
    centre.map((c, i) => c * Math.cos(a) + east[i]! * Math.sin(a)) as Vec3,
  );
  const r0 = normalize3(cross3(forward, [0, 0, 1]));
  const u0 = cross3(r0, forward);
  const t = view.rollDeg * DEG;
  const right = r0.map((c, i) => c * Math.cos(t) + u0[i]! * Math.sin(t)) as Vec3;
  const tanShort = Math.tan(35 * DEG);
  const { width, height } = view.size;
  const tanUp = width < height ? (tanShort * height) / width : tanShort;
  const tanRight = (tanUp * width) / height;
  return {
    kind: 'rectilinear',
    basis: { forward, right, up: cross3(right, forward) },
    frustum: { tanLeft: -tanRight, tanRight, tanDown: -tanUp, tanUp },
    size: view.size,
  };
}

/** A sprite point's screen px, as decor.wesl's vertex stage maps it (a negative half-width mirrors). */
function pxOfSpritePoint(inst: AntiqueOrnamentInstance, u: number, v: number): [number, number] {
  const lx = (2 * u - 1) * inst.halfPx[0];
  const ly = (2 * v - 1) * inst.halfPx[1];
  const c = Math.cos(inst.rotation);
  const s = Math.sin(inst.rotation);
  return [inst.centrePx[0] + c * lx + s * ly, inst.centrePx[1] - s * lx + c * ly];
}

describe('ANTIQUE_FIGURE_ANCHORS', () => {
  const figures = ANTIQUE_ORNAMENTS.filter((o) => o.anchor.kind === 'sky');

  it('anchors every constellation figure to at least three stars', () => {
    expect(figures.length).toBe(3);
    for (const f of figures)
      if (f.anchor.kind === 'sky') expect(f.anchor.stars.length).toBeGreaterThanOrEqual(3);
  });

  for (const row of figures)
    for (const view of VIEWS)
      it(`prints ${row.sprite}'s anchor stars on their stars (${view.name})`, () => {
        if (row.anchor.kind !== 'sky') throw new Error('a figure is anchored on the sky');
        const { stars } = row.anchor;
        const dirs = stars.map((a) => raDecDistToCartesian(a.raDeg, a.decDeg, 1));
        const mean = normalize3(
          dirs.reduce<Vec3>((s, d) => [s[0] + d[0], s[1] + d[1], s[2] + d[2]], [0, 0, 0]),
        );
        const projection = viewOf(mean, view);
        const [inst] = placeAntiqueOrnaments({
          ornaments: [row],
          atlas: ANTIQUE_ORNAMENT_ATLAS,
          projection,
          unitPx: 0.1,
          camPosMpc: [0, 0, 0],
          cartouche: null,
        });
        expect(inst).toBeDefined();
        const missDeg = stars.map((a, i) => {
          const drawn = normalize3(rayOfPx(projection, pxOfSpritePoint(inst!, a.u, a.v))!);
          const miss = Math.acos(Math.min(1, dot3(drawn, dirs[i]!)));
          return [a.star, Math.round((miss / DEG) * 10) / 10] as const;
        });
        expect(missDeg.filter(([, d]) => d > view.toleranceDeg)).toEqual([]);
      });
});
