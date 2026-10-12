import { describe, expect, it } from 'vitest';
import { aboveRingAnchor } from '../../../src/utils/labels/aboveRingAnchor';
import { dot3 } from '../../../src/utils/math/dot3';
import { normalize3 } from '../../../src/utils/math/normalize3';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const RADIUS = 3;
const GAP = 0.5;
// The camera looks down -z with screen-up +y; centres are camera-relative.
const SCREEN_UP: Vec3 = [0, 1, 0];

const anchorFor = (centre: Vec3): Vec3 => aboveRingAnchor(centre, SCREEN_UP, centre, RADIUS, GAP);

describe('label above an eye-facing ring', () => {
  it('on the view axis the lift is along screen-up', () => {
    const centre: Vec3 = [0, 0, -100];
    expect(anchorFor(centre)).toEqual([0, RADIUS + GAP, -100]);
  });

  it("off-axis the anchor lies in the ring's plane (perpendicular to the sight line) at radius + gap from the centre", () => {
    const off = (15 * Math.PI) / 180;
    const centre: Vec3 = [0, 100 * Math.sin(off), -100 * Math.cos(off)];
    const anchor = anchorFor(centre);
    const lift: Vec3 = [anchor[0] - centre[0], anchor[1] - centre[1], anchor[2] - centre[2]];
    expect(dot3(lift, normalize3(centre))).toBeCloseTo(0, 9);
    expect(Math.hypot(...lift)).toBeCloseTo(RADIUS + GAP, 9);
  });
});
