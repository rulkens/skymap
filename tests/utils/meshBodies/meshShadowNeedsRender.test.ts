/**
 * The re-render key: too eager and every rover redraws its layer each frame, too lax and a
 * turning body's shadow lags its terminator.
 */

import { describe, it, expect } from 'vitest';
import { meshShadowNeedsRender } from '../../../src/utils/meshBodies/meshShadowNeedsRender';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const turned = (deg: number): Vec3 => {
  const rad = (deg * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad), 0];
};

describe('meshShadowNeedsRender', () => {
  it('keeps a layer through a 0.05° sun move and redraws it at 0.2°', () => {
    expect(meshShadowNeedsRender([1, 0, 0], turned(0.05))).toBe(false);
    expect(meshShadowNeedsRender([1, 0, 0], turned(0.2))).toBe(true);
  });
});
