/**
 * smoothstep — the shared cubic-Hermite fade primitive.  These tests pin
 * the endpoints, the clamp outside the band, the symmetric midpoint, and
 * the degenerate zero-width band.
 */

import { describe, it, expect } from 'vitest';
import { smoothstep } from '../../../src/utils/math/smoothstep';

describe('smoothstep', () => {
  it('returns 0 at and below the lower edge', () => {
    expect(smoothstep(10, 50, 10)).toBe(0);
    expect(smoothstep(10, 50, -5)).toBe(0);
  });

  it('returns 1 at and above the upper edge', () => {
    expect(smoothstep(10, 50, 50)).toBe(1);
    expect(smoothstep(10, 50, 999)).toBe(1);
  });

  it('returns 0.5 at the band midpoint (symmetric S-curve)', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
  });

  it('eases with zero slope at the edges (no kink)', () => {
    // Just inside the lower edge the value is still very near 0; a linear
    // ramp would already be at 1% here, the cubic is markedly less.
    expect(smoothstep(0, 1, 0.01)).toBeLessThan(0.01);
    // Symmetric near the upper edge.
    expect(smoothstep(0, 1, 0.99)).toBeGreaterThan(0.99);
  });

  it('treats a zero-width band as a hard step', () => {
    expect(smoothstep(5, 5, 4.999)).toBe(0);
    expect(smoothstep(5, 5, 5)).toBe(1);
    expect(smoothstep(5, 5, 5.001)).toBe(1);
  });
});
