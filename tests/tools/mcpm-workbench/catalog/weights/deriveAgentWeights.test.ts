/**
 * deriveAgentWeights — the port's transform order and the NaN median fill:
 * NaN → finite median, w = log10(1 + max(W, 0)), divide by mean(W), scale by 1e6/n.
 * Expected values are worked out by hand from that formula.
 */
import { describe, expect, it } from 'vitest';
import { deriveAgentWeights } from '../../../../../tools/mcpm-workbench/src/catalog/weights/deriveAgentWeights';
import { massWeightFromLog10 } from '../../../../../tools/mcpm-workbench/src/catalog/weights/massWeightFromLog10';

describe('deriveAgentWeights', () => {
  it('NaN masses take the finite median with an even finite count', () => {
    // Median 9.5 fills the NaN; mean(W) = 47.5 / 5 = 9.5 → 2e5 · log10(10.5) / 9.5.
    const input = new Float32Array([8, 9, 10, 11, NaN]);
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.weights[4]! / 21498.722 - 1).toBeCloseTo(0, 5);
  });

  it('nanCount reports how many entries were filled', () => {
    const input = new Float32Array([8, NaN, 9, NaN, 10]);
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.nanCount).toBe(2);
  });

  it("matches the port's formula on linear weights", () => {
    // mean(W) = 0.37; (1e6 / 3) / 0.37 · log10(1.01), log10(1.1), log10(2).
    const expected = [3893.1295, 37290.707, 271198.19];
    const result = deriveAgentWeights(new Float32Array([0.01, 0.1, 1]), 'stellarMass');
    expected.forEach((e, i) => expect(Math.abs(result.weights[i]! / e - 1)).toBeLessThan(1e-5));
  });

  it('mass weighting separates a 1e8 and a 1e12 Msun galaxy like the port', () => {
    const input = new Float32Array([8, 12].map(massWeightFromLog10));
    const { weights } = deriveAgentWeights(input, 'stellarMass');
    expect(weights[1]! / weights[0]!).toBeGreaterThan(1000);
  });

  // The port has no uniform mode; it keeps the workbench's own 1e6 total.
  it('uniform mode still sums to 1e6', () => {
    const input = new Float32Array([8, 500, NaN, -3, 11.7]);
    const result = deriveAgentWeights(input, 'uniform');
    const expected = 1e6 / input.length;
    for (let i = 0; i < result.weights.length; i++) {
      expect(result.weights[i]).toBeCloseTo(expected, 3);
    }
  });

  it('all-NaN masses degrade to uniform weights', () => {
    const input = new Float32Array([NaN, NaN, NaN]);
    const result = deriveAgentWeights(input, 'stellarMass');
    const expected = 1e6 / input.length;
    for (let i = 0; i < result.weights.length; i++) {
      expect(result.weights[i]).toBeCloseTo(expected, -1);
    }
    expect(result.nanCount).toBe(3);
  });
});
