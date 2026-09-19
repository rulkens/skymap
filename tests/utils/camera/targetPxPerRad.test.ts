import { describe, expect, it } from 'vitest';
import { targetPxPerRad } from '../../../src/utils/camera/targetPxPerRad';

describe('targetPxPerRad', () => {
  const ctx = { drawPxPerRad: 935.25, canvasSize: { width: 1920, height: 1080 } };

  it('is the view own drawPxPerRad, bit for bit, on a canvas-sized target', () => {
    expect(targetPxPerRad(ctx, 1080)).toBe(935.25);
  });

  it('halves on a half-res target', () => {
    expect(targetPxPerRad(ctx, 540)).toBe(935.25 / 2);
  });
});
