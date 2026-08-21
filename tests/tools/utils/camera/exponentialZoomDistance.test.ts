import { describe, expect, it } from 'vitest';
import { exponentialZoomDistance } from '../../../../tools/utils/camera/exponentialZoomDistance';

describe('exponentialZoomDistance', () => {
  it('scales distance by exp(deltaY * zoomSpeed) — a positive notch zooms out', () => {
    expect(exponentialZoomDistance(100, 500, 0.0018)).toBeCloseTo(100 * Math.exp(0.9), 10);
  });

  it('a negative wheel delta zooms in, shrinking distance', () => {
    const zoomedIn = exponentialZoomDistance(100, -500, 0.0018);
    expect(zoomedIn).toBeLessThan(100);
    expect(zoomedIn).toBeCloseTo(100 * Math.exp(-0.9), 10);
  });

  it('a zero wheel delta leaves distance unchanged', () => {
    expect(exponentialZoomDistance(42, 0, 0.0018)).toBe(42);
  });
});
