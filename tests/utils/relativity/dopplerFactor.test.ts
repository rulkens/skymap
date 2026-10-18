import { describe, expect, it } from 'vitest';
import { dopplerFactor } from '../../../src/utils/relativity/dopplerFactor';

describe('dopplerFactor', () => {
  it('dopplerFactor is γ(1+β) ahead and γ(1−β) behind', () => {
    const beta = 0.8;
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    expect(dopplerFactor(1, beta, gamma)).toBeCloseTo(gamma * (1 + beta), 12);
    expect(dopplerFactor(-1, beta, gamma)).toBeCloseTo(gamma * (1 - beta), 12);
  });
});
