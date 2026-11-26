import { describe, expect, it } from 'vitest';
import type { OutputProjection } from '../../../src/@types/rendering/OutputProjection';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { labelCornerPx } from '../../../src/utils/labels/labelCornerPx';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { equidistantFixture } from '../../helpers/labels/equidistantFixture';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

const dome = equidistantFixture(2000);
const ZENITH: Vec3 = [0, 1, 0];
const FRONT_HORIZON: Vec3 = [0, 0, 1];

function corner(dir: Vec3, offsetPx: Vec2, p: OutputProjection = dome): Vec2 {
  const anchor: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
  projectLabel(dir, p, anchor);
  const out: Vec2 = [0, 0];
  labelCornerPx(anchor, offsetPx, p, out);
  return out;
}
const span = (dir: Vec3, from: Vec2, to: Vec2): number => {
  const start = corner(dir, from);
  const end = corner(dir, to);
  return Math.hypot(end[0] - start[0], end[1] - start[1]);
};

describe('labelCornerPx', () => {
  it('a pinhole corner is the rigid offset', () => {
    const pinhole = pinholeFixture({
      eye: [0, 0, 0],
      forward: [0, 0, -1],
      up: [0, 1, 0],
      frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
      sizePx: [1600, 900],
    }).output;
    const anchorPx = corner([0.2, -0.1, 1], [0, 0], pinhole);
    expect(corner([0.2, -0.1, 1], [37, 11], pinhole)).toEqual([anchorPx[0] + 37, anchorPx[1] - 11]);
  });

  it('a dome label at the horizon is π/2 times wider in the image than at the zenith', () => {
    const atZenith = span(ZENITH, [-50, 0], [50, 0]);
    const atHorizon = span(FRONT_HORIZON, [-50, 0], [50, 0]);
    // θ / sin θ at 90°; the card's own flatness costs 0.1% over 100 px.
    expect(atHorizon / atZenith).toBeCloseTo(Math.PI / 2, 2);
  });

  it("a dome label's height is the same at the zenith and the horizon", () => {
    expect(span(FRONT_HORIZON, [0, 0], [0, 50])).toBeCloseTo(span(ZENITH, [0, 0], [0, 50]), 9);
  });

  // The fisheye image is the dome seen from inside: `domeResample/fisheye.wesl` puts dome +x
  // (the right of someone facing the front) at image right and the front at the bottom, where
  // up (toward the zenith) is image-up. So a reader's left-to-right is image +x there.
  it('dome text reads left to right from inside the dome', () => {
    expect(corner(FRONT_HORIZON, [50, 0])[0]).toBeGreaterThan(corner(FRONT_HORIZON, [-50, 0])[0]);
    // At the back the image shows the text upside down: its up still points at the zenith.
    expect(corner([0, 0, -1], [50, 0])[0]).toBeLessThan(corner([0, 0, -1], [-50, 0])[0]);
    // The zenith's card keeps the same hand.
    expect(corner(ZENITH, [50, 0])[0]).toBeGreaterThan(corner(ZENITH, [-50, 0])[0]);
  });

  it('a corner under the horizon lands outside the circle, not at the origin', () => {
    const below = corner(FRONT_HORIZON, [0, -20]);
    expect(below[0]).toBeCloseTo(1000, 9);
    expect(below[1]).toBeGreaterThan(2000);
  });
});
