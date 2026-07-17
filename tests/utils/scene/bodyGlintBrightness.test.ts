/**
 * bodyGlintBrightness — unit tests for the sub-pixel body brightness product.
 *
 * The load-bearing behaviours: the phase term zeroes a body whose lit face is
 * turned away (the unlit-far-side skip the layer relies on), full phase passes
 * the size x albedo product straight through, and — at equal apparent size and
 * phase — a high-albedo body outshines a dark one (Venus over Neptune, the
 * naked-eye planet ranking). Hand-computed expectations, never a mirror of the
 * source formula.
 */

import { describe, it, expect } from 'vitest';
import { bodyGlintBrightness } from '../../../src/utils/scene/bodyGlintBrightness';
import { BODY_GLINT_MAX_PX } from '../../../src/services/engine/frame/partitionBodiesByPresentation';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const ORIGIN: Vec3 = [0, 0, 0];

describe('bodyGlintBrightness', () => {
  it('is 0 for a body whose lit face is turned away (new phase, camera on the far side)', () => {
    // Body at +x from the Sun; camera farther out along the SAME ray, so it sees
    // the unlit far side: toSun = -x, toCam = +x, cos = -1, illuminated
    // fraction = 0. No light regardless of size or albedo.
    const brightness = bodyGlintBrightness({
      albedo: [1, 1, 1],
      positionMpc: [1, 0, 0],
      camPosMpc: [2, 0, 0],
      renderOriginMpc: ORIGIN,
      apparentDiameterPx: BODY_GLINT_MAX_PX, // max size — still 0, phase dominates
    });
    expect(brightness).toBeCloseTo(0, 12);
  });

  it('passes size x albedo straight through at full phase (camera on the sunlit side)', () => {
    // Camera between the Sun and the body: toSun = toCam = -x, cos = 1,
    // illuminated fraction = 1. Half the max apparent size → sizeFactor 0.5;
    // a mid-grey albedo → Rec.709 luma 0.5. Product = 0.5 * 0.5 * 1 = 0.25.
    const brightness = bodyGlintBrightness({
      albedo: [0.5, 0.5, 0.5],
      positionMpc: [1, 0, 0],
      camPosMpc: [0.5, 0, 0],
      renderOriginMpc: ORIGIN,
      apparentDiameterPx: BODY_GLINT_MAX_PX / 2,
    });
    expect(brightness).toBeCloseTo(0.25, 6);
  });

  it('ranks a high-albedo body over a dark one at equal apparent size and phase (Venus over Neptune)', () => {
    const common = {
      positionMpc: [1, 0, 0] as Vec3,
      camPosMpc: [0.5, 0, 0] as Vec3, // full phase for both
      renderOriginMpc: ORIGIN,
      apparentDiameterPx: BODY_GLINT_MAX_PX / 2, // same size
    };
    // Venus — bright, high-albedo cloud deck; Neptune — dim, deep blue.
    const venus = bodyGlintBrightness({ ...common, albedo: [0.9, 0.88, 0.8] });
    const neptune = bodyGlintBrightness({ ...common, albedo: [0.2, 0.3, 0.5] });
    expect(venus).toBeGreaterThan(neptune);
  });
});
