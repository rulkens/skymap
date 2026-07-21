import { describe, it, expect } from 'vitest';
import { RATE_LADDER } from '../../../src/data/time/rateLadder';

describe('RATE_LADDER', () => {
  it('each step is strictly faster than its predecessor', () => {
    // Structural invariant: the ladder is authored ascending, and the clock's
    // "faster"/"slower" nudges assume monotone order. A transcription swap of
    // two rows would violate this without any value being restated here.
    const speeds = RATE_LADDER.map((step) => step.simSecPerRealSec);
    const sorted = [...speeds].sort((a, b) => a - b);
    expect(speeds).toEqual(sorted);
    expect(new Set(speeds).size).toBe(speeds.length);
  });

  it('every label is non-empty and unique', () => {
    const labels = RATE_LADDER.map((step) => step.label);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });
});
