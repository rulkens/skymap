/**
 * starCullMargins — pins the tangent-form radian margin and the "only keeps
 * more nodes" property (K1 ruling): `pxRadius/pxPerRad` is strictly ≥ the old
 * small-angle `pxRadius·fovY/h` margin for any fovY, because `tan(x) ≥ x`.
 */

import { describe, it, expect } from 'vitest';
import { starCullMargins } from '../../../src/utils/star/starCullMargins';
import {
  STAR_SIZE_REF_PX,
  STAR_GLOW_MIN_PX,
  STAR_PICK_MIN_RADIUS_PX,
} from '../../../src/data/starCullSlack';

const H = 720;

/** Pinhole px/rad off a symmetric frustum's fovY, matching `deriveView`'s form. */
function pxPerRadAt(fovYRad: number): number {
  return H / (2 * Math.tan(fovYRad / 2));
}

describe('starCullMargins', () => {
  it.each([
    ['60°', Math.PI / 3],
    ['90°', Math.PI / 2],
  ])(
    'at %s, leaf/pick pin the tangent form and stay ≥ the old small-angle margin',
    (_label, fovYRad) => {
      const sizePx = STAR_SIZE_REF_PX * 1.5;
      const pxPerRad = pxPerRadAt(fovYRad);
      const { leaf, pick } = starCullMargins(sizePx, pxPerRad);

      const leafPxRadius = STAR_GLOW_MIN_PX * (sizePx / STAR_SIZE_REF_PX);
      const pickPxRadius = Math.max(leafPxRadius, STAR_PICK_MIN_RADIUS_PX);

      // Tangent-form pin: margin = pxRadius / pxPerRad = pxRadius * 2*tan(fovY/2) / h.
      expect(leaf).toBeCloseTo((leafPxRadius * 2 * Math.tan(fovYRad / 2)) / H, 12);
      expect(pick).toBeCloseTo((pickPxRadius * 2 * Math.tan(fovYRad / 2)) / H, 12);

      // The "only keeps more nodes" property.
      expect(leaf).toBeGreaterThanOrEqual((leafPxRadius * fovYRad) / H);
      expect(pick).toBeGreaterThanOrEqual((pickPxRadius * fovYRad) / H);
    },
  );
});
