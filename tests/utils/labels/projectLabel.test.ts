import { describe, expect, it } from 'vitest';
import type { ForwardProjectedPoint } from '../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { forwardProjectPoint } from '../../../src/utils/camera/projection/forwardProjectPoint';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { equidistantFixture } from '../../helpers/labels/equidistantFixture';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

// A lens-shifted frustum (the cover shift), so the principal point is off-centre.
const DY = 2 * Math.tan(Math.PI / 6);
const DX = (DY * 1600) / 900;
const camera = pinholeFixture({
  eye: [3.2, -1.1, 0.7],
  forward: [0.48, 0.6, -0.64],
  up: [0, 0, 1],
  frustum: {
    tanLeft: -DX / 2 + 0.2,
    tanRight: DX / 2 + 0.2,
    tanDown: -DY / 2 - 0.1,
    tanUp: DY / 2 - 0.1,
  },
  sizePx: [1600, 900],
});

describe('projectLabel', () => {
  it('projectLabel matches the view-projection matrix path', () => {
    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    const ref: ForwardProjectedPoint = {
      clipX: 0,
      clipY: 0,
      clipZ: 0,
      clipW: 0,
      screenX: 0,
      screenY: 0,
      onScreen: false,
    };
    let checked = 0;
    for (let i = -6; i <= 6; i++) {
      for (let j = -6; j <= 6; j++) {
        for (const dist of [0.01, 2, 300]) {
          const p: Vec3 = [
            3.2 + i * 0.13 * dist,
            -1.1 + j * 0.11 * dist,
            0.7 + (i - j) * 0.07 * dist,
          ];
          projectLabel(camera.viewOf(p), camera.output, out);
          forwardProjectPoint(camera.vp, p[0], p[1], p[2], camera.output.sizePx, ref);
          expect(out.visible).toBe(ref.clipW > 0);
          if (!out.visible) continue;
          expect(Math.abs(out.px[0] - ref.screenX)).toBeLessThan(1e-3);
          expect(Math.abs(out.px[1] - ref.screenY)).toBeLessThan(1e-3);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('projectLabel, equidistant', () => {
  const dome = equidistantFixture(2000);
  const project = (v: Vec3): ProjectedLabel => {
    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    projectLabel(v, dome, out);
    return out;
  };
  const expectVec2 = (got: readonly number[], want: readonly number[]) => {
    expect(got[0]).toBeCloseTo(want[0]!, 9);
    expect(got[1]).toBeCloseTo(want[1]!, 9);
  };

  it('zenith lands on the centre with image-up', () => {
    const out = project([0, 1, 0]);
    expectVec2(out.px, [1000, 1000]);
    expectVec2(out.up, [0, -1]);
    expect(out.visible).toBe(true);
  });

  it('the front horizon lands at the bottom edge', () => {
    const out = project([0, 0, 1]);
    expectVec2(out.px, [1000, 2000]);
    expectVec2(out.up, [0, -1]);
  });

  it('the right horizon lands at the right edge, up pointing left', () => {
    const out = project([1, 0, 0]);
    expectVec2(out.px, [2000, 1000]);
    expectVec2(out.up, [-1, 0]);
  });

  it('45° up at the front is half-way down', () => {
    expect(project([0, 1, 1]).px[1]).toBeCloseTo(1500, 9);
  });

  it('below the horizon is not visible', () => {
    expect(project([0, -0.1, 1]).visible).toBe(false);
  });

  it('pxPerRad is N/π everywhere', () => {
    expect(project([0, 1, 0]).pxPerRad).toBe(2000 / Math.PI);
    expect(project([0.3, 0.2, -0.9]).pxPerRad).toBe(2000 / Math.PI);
  });

  it('a wide canvas stretches the horizon to its edges, as the resample does', () => {
    const wide = equidistantFixture(2000, 1000);
    const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };
    projectLabel([1, 0, 0], wide, out);
    expectVec2(out.px, [2000, 500]);
    projectLabel([0, 0, 1], wide, out);
    expectVec2(out.px, [1000, 1000]);
    expect(out.pxPerRad).toBe(1000 / Math.PI);
  });

  it('scale does not matter', () => {
    const v: Vec3 = [0.3, 0.2, -0.9];
    expectVec2(project([v[0] * 1e-22, v[1] * 1e-22, v[2] * 1e-22]).px, project(v).px);
  });
});
