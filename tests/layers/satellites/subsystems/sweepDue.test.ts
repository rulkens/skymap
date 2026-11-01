import { describe, expect, it } from 'vitest';
import { sweepDue } from '../../../../src/layers/satellites/subsystems/sweepDue';

const last = { simMs: 1_000_000, atMs: 5_000 };

describe('sweepDue', () => {
  it('asks for the first sweep', () => {
    expect(sweepDue(null, 0, 0)).toBe(true);
  });

  it('re-sweeps once a real second has passed and the clock has moved', () => {
    expect(sweepDue(last, last.simMs + 1_000, last.atMs + 999)).toBe(false);
    expect(sweepDue(last, last.simMs + 1_000, last.atMs + 1_000)).toBe(true);
  });

  it('costs nothing while the clock is paused', () => {
    expect(sweepDue(last, last.simMs, last.atMs + 60_000)).toBe(false);
  });

  it('re-sweeps at once when the clock jumps beyond what extrapolation holds', () => {
    expect(sweepDue(last, last.simMs - 31_000, last.atMs + 10)).toBe(true);
  });
});
