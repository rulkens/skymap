/**
 * deriveAgentWeights — fork-exact transform order + NaN median-fill accounting.
 *
 * Order under test (spec §6, §15 decision 8): NaN → finite median,
 * w = log10(1 + max(W, 0)), divide by mean(w), scale by 1e6/n_points.
 */
import { describe, expect, it } from 'vitest';
import { deriveAgentWeights } from '../../../../tools/mcpm-workbench/src/field/deriveAgentWeights';

const mean = (a: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]!;
  return sum / a.length;
};

describe('deriveAgentWeights', () => {
  it('NaN masses take the finite median with an odd finite count', () => {
    const input = new Float32Array([8, 10, 9, NaN]); // finite sorted: 8,9,10 → median 9
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.medianLog10Mass).toBe(9);
  });

  it('NaN masses take the finite median with an even finite count', () => {
    const input = new Float32Array([8, 9, 10, 11, NaN]); // finite sorted: 8,9,10,11 → median 9.5
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.medianLog10Mass).toBe(9.5);
  });

  it('nanCount reports how many entries were filled', () => {
    const input = new Float32Array([8, NaN, 9, NaN, 10]);
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(result.nanCount).toBe(2);
  });

  it('weights average 1e6 / n after normalisation', () => {
    const input = new Float32Array([8, 9, 10, 11, 12]);
    const result = deriveAgentWeights(input, 'stellarMass');
    expect(mean(result.weights)).toBeCloseTo(1e6 / input.length, 3);
  });

  it('uniform mode ignores mass entirely', () => {
    const input = new Float32Array([8, 500, NaN, -3, 11.7]);
    const result = deriveAgentWeights(input, 'uniform');
    const expected = 1e6 / input.length;
    for (let i = 0; i < result.weights.length; i++) {
      expect(result.weights[i]).toBeCloseTo(expected, 3);
    }
  });
});
