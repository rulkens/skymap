import { describe, expect, it } from 'vitest';
import type { ForwardProjectedPoint } from '../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { forwardProjectPoint } from '../../../src/utils/camera/projection/forwardProjectPoint';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
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
