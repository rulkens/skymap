/**
 * deriveAgentWeights — fork-exact transform order + NaN median-fill accounting.
 *
 * Order under test (spec §6, §15 decision 8): NaN → finite median,
 * w = log10(1 + max(W, 0)), divide by mean(W), scale by 1e6/n_points.
 */
import { describe, expect, it } from 'vitest';
import { deriveAgentWeights } from '../../../../tools/mcpm-workbench/src/field/deriveAgentWeights';
import { massWeightFromLog10 } from '../../../../tools/mcpm-workbench/src/field/massWeightFromLog10';

describe('deriveAgentWeights', () => {
  it('NaN masses take the finite median with an even finite count', () => {
    const input = new Float32Array([8, 9, 10, 11, NaN]); // finite sorted: 8,9,10,11 → median 9.5
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.medianWeight).toBe(9.5);
  });

  it('nanCount reports how many entries were filled', () => {
    const input = new Float32Array([8, NaN, 9, NaN, 10]);
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.nanCount).toBe(2);
  });

  it("matches the port's formula on linear weights", () => {
    const w = [0.01, 0.1, 1];
    const meanW = w.reduce((a, b) => a + b, 0) / w.length;
    const result = deriveAgentWeights(new Float32Array(w), 'stellarMass');
    w.forEach((wi, i) => {
      const expected = (1e6 / w.length) * (Math.log10(1 + wi) / meanW);
      expect(Math.abs(result.weights[i]! / expected - 1)).toBeLessThan(1e-3);
    });
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
    expect(result.medianWeight).toBeNaN();
    expect(result.nanCount).toBe(3);
  });
});
