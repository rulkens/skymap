import { describe, expect, it } from 'vitest';
import { captionTint } from '../../../src/utils/color/captionTint';

const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('captionTint', () => {
  it('lifts a dark tint to exactly the luminance floor', () => {
    // Mercury's albedo — the darkest caption tint in the seed set.
    expect(luminance(captionTint([0.3, 0.29, 0.27]))).toBeCloseTo(0.65, 6);
  });

  it('leaves an already-bright tint at its display value', () => {
    // Venus: bright enough that only the display encode applies.
    const tint = captionTint([0.85, 0.8, 0.6]);
    expect(luminance(tint)).toBeGreaterThan(0.65);
    expect(tint[0]).toBeCloseTo(0.9309, 3);
  });

  it('keeps channel ordering, so the lift never inverts a hue', () => {
    const [r, g, b] = captionTint([0.3, 0.42, 0.75]);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
  });

  it('never clips a channel past display white', () => {
    for (const c of captionTint([0, 0, 0.02])) expect(c).toBeLessThanOrEqual(1);
  });
});
