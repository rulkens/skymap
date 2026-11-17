import { describe, expect, it } from 'vitest';

import type { VasilievStar } from '../../../../tools/streams/@types/VasilievStar';
import { sagittariusCentrelines } from '../../../../tools/streams/utils/sagittariusCentrelines';
import { eqCartToRaDecDist } from '../../../../tools/utils/math/eqCartToRaDecDist';

// A toy Sagittarius on a circular orbit of radius 20 kpc in the x–y plane, the Sun at the centre
// (positions double as heliocentric): the remnant at angle 0, moving toward +y. Leading debris
// sits ahead (more bound, slower), trailing behind (less bound, faster).
const R = 20;
function star(angleDeg: number, speed: number, tStripGyr: number): VasilievStar {
  const a = (angleDeg * Math.PI) / 180;
  const [x, y] = [R * Math.cos(a), R * Math.sin(a)];
  const sky = eqCartToRaDecDist([x / 1000, y / 1000, 0]);
  return {
    x,
    y,
    z: 0,
    vx: -speed * Math.sin(a),
    vy: speed * Math.cos(a),
    vz: 0,
    ra: sky.raHours * 15,
    dec: sky.decDeg,
    distanceKpc: sky.distMpc * 1000,
    tStripGyr,
  };
}
const stars = [
  ...Array.from({ length: 200 }, (_, i) => star((i % 5) - 2, 200, 0)),
  ...Array.from({ length: 1600 }, (_, i) => star(3 + (i % 160), 150, -1)),
  ...Array.from({ length: 1600 }, (_, i) => star(-3 - (i % 160), 250, -1)),
];

describe('sagittariusCentrelines', () => {
  const { leadingKpc, trailingKpc } = sagittariusCentrelines(stars);
  const angleOf = (p: readonly number[]) => (Math.atan2(p[1]!, p[0]!) * 180) / Math.PI;

  it('gives two arms, each starting at the remnant', () => {
    for (const arm of [leadingKpc, trailingKpc]) {
      expect(arm.length).toBeGreaterThan(4);
      expect(Math.hypot(arm[0]![0] - R, arm[0]![1], arm[0]![2])).toBeLessThan(0.5);
    }
  });

  it('the leading arm runs ahead of the remnant and the trailing arm behind, each in order', () => {
    const lead = leadingKpc.slice(1).map(angleOf);
    const trail = trailingKpc.slice(1).map(angleOf);
    expect(lead.every((a, i) => a > 0 && (i === 0 || a > lead[i - 1]!))).toBe(true);
    expect(trail.every((a, i) => a < 0 && (i === 0 || a < trail[i - 1]!))).toBe(true);
  });
});
