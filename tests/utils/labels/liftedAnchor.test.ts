import { describe, expect, it } from 'vitest';
import type { ForwardProjectedPoint } from '../../../src/@types/camera/projection/ForwardProjectedPoint';
import type { ProjectedLabel } from '../../../src/@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { forwardProjectPoint } from '../../../src/utils/camera/projection/forwardProjectPoint';
import { symmetricFrustum } from '../../../src/utils/camera/frustum/symmetricFrustum';
import { liftedAnchor } from '../../../src/utils/labels/liftedAnchor';
import { projectLabel } from '../../../src/utils/labels/projectLabel';
import { proposedLiftPx } from '../../../src/utils/labels/proposedLiftPx';
import { liftedLabelPlacement } from '../../../src/services/engine/presentation/liftedLabelPlacement';
import { pinholeFixture } from '../../helpers/labels/pinholeFixture';

const camera = pinholeFixture({
  eye: [0, 0, 0],
  forward: [0, 0, -1],
  up: [0, 1, 0],
  frustum: symmetricFrustum(Math.PI / 3, 1600 / 900),
  sizePx: [1600, 900],
});
const fresh = (): ProjectedLabel => ({ px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false });

describe('liftedAnchor', () => {
  it('liftedAnchor matches liftedLabelPlacement at small angles', () => {
    const ref: ForwardProjectedPoint = {
      clipX: 0,
      clipY: 0,
      clipZ: 0,
      clipW: 0,
      screenX: 0,
      screenY: 0,
      onScreen: false,
    };
    // On the horizon line, where a turn toward view +y is pure screen-up.
    for (const x of [-7, -3, 0, 2, 6]) {
      for (const halfAngleDeg of [0.05, 0.4, 0.95]) {
        const anchor: Vec3 = [x, 0, -10];
        const v = camera.viewOf(anchor);
        const dist = Math.hypot(...v);
        const radius = dist * Math.sin((halfAngleDeg * Math.PI) / 180);
        const at = fresh();
        projectLabel(v, camera.output, at);
        const radiusPx = Math.asin(radius / dist) * at.pxPerRad;
        const subjectSizePx = 2 * radiusPx;

        const placement = liftedLabelPlacement({
          anchorWorldPos: anchor,
          vp: camera.vp,
          viewportPx: camera.output.sizePx,
          pxPerRad: camera.output.focalPx,
          subjectSizePx,
          textBbox: null,
          worldEmMpc: 1,
          minPixelSize: 8,
          maxPixelSize: 64,
        })!;
        forwardProjectPoint(camera.vp, ...placement.labelWorldPos, camera.output.sizePx, ref);

        const out = fresh();
        liftedAnchor(v, radius, proposedLiftPx(subjectSizePx) - radiusPx, camera.output, out);
        expect(Math.abs(out.px[0] - ref.screenX)).toBeLessThan(0.05);
        expect(Math.abs(out.px[1] - ref.screenY)).toBeLessThan(0.05);
      }
    }
  });

  it('liftedAnchor caps the lift at 90 degrees when the eye is inside the sphere', () => {
    const v: Vec3 = [0, -0.5, 0.5]; // 45° below the axis, 0.71 from the centre
    const gapPx = 6;
    const inside = fresh();
    const deepInside = fresh();
    liftedAnchor(v, 1, gapPx, camera.output, inside);
    liftedAnchor(v, 10, gapPx, camera.output, deepInside);
    // Turned a full 90° toward up: 45° above the axis, then the gap.
    const { centrePx, focalPx } = camera.output;
    expect(inside.visible).toBe(true);
    expect(inside.px[0]).toBeCloseTo(centrePx[0], 9);
    expect(inside.px[1]).toBeCloseTo(centrePx[1] - focalPx - gapPx, 6);
    expect(deepInside.px).toEqual(inside.px);
  });
});
