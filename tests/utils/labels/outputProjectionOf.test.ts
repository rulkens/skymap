import { describe, expect, it } from 'vitest';
import type { ForwardProjectedPoint } from '../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { VIEW_RIGS } from '../../../src/data/rendering/viewRigs';
import { forwardProjectPoint } from '../../../src/utils/camera/projection/forwardProjectPoint';
import { rotateVec3ByTightMat3 } from '../../../src/utils/math/rotateVec3ByTightMat3';
import { outputProjectionOf } from '../../../src/utils/labels/outputProjectionOf';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { frameViewsAt } from '../../helpers/frame/frameViewsAt';

// frameViewsAt's 1-rad lens on a 1920×1080 canvas, shifted as a cover shift would.
const TAN_UP = Math.tan(0.5);
const TAN_RIGHT = (TAN_UP * 1920) / 1080;

describe('outputProjectionOf', () => {
  it("projects through the mono pinhole where the view's own vp does", () => {
    const eye: Vec3 = [3e-12, -2e-12, 1e-12];
    const [view] = frameViewsAt({
      eyeMpc: eye,
      forward: [0.3, -0.5, 0.81],
      distanceMpc: 1e-3,
      frustum: {
        tanLeft: -TAN_RIGHT + 0.15,
        tanRight: TAN_RIGHT + 0.15,
        tanDown: -TAN_UP - 0.08,
        tanUp: TAN_UP - 0.08,
      },
    });
    const output = outputProjectionOf(view!, VIEW_RIGS.mono);
    const drawn = view!.drawCamPos;
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(output.camHi[k]! + output.camLo[k]! - drawn[k]!)).toBeLessThan(1e-24);
    }

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
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const p: Vec3 = [0.3 + i * 0.09, -0.5 + j * 0.07, 0.81 + (i + j) * 0.05];
        const v = rotateVec3ByTightMat3(output.viewFromWorld, [
          p[0] - drawn[0],
          p[1] - drawn[1],
          p[2] - drawn[2],
        ]);
        projectLabel(v, output, out);
        forwardProjectPoint(view!.vp, p[0], p[1], p[2], output.sizePx, ref);
        expect(out.visible).toBe(true);
        expect(Math.abs(out.px[0] - ref.screenX)).toBeLessThan(0.01);
        expect(Math.abs(out.px[1] - ref.screenY)).toBeLessThan(0.01);
        checked++;
      }
    }
    expect(checked).toBe(81);
  });

  it("scales authored px by the canvas's device pixel ratio", () => {
    const at = { eyeMpc: [0, 0, 0] as Vec3, forward: [0, 0, -1] as Vec3, distanceMpc: 1 };
    expect(outputProjectionOf(frameViewsAt(at)[0]!, VIEW_RIGS.mono).pxScale).toBe(1);
    const [dense] = frameViewsAt({ ...at, pxPerCssPx: 2 });
    expect(outputProjectionOf(dense!, VIEW_RIGS.mono).pxScale).toBe(2);
  });
});
