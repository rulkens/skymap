/**
 * dwellDrift tests — verify the dwell clip is a velocity envelope synced to the
 * duration it is handed: ease in to a cruise rate, hold, ease out to rest.
 *
 * The envelope is the awaited `seq([rate, hold, rate])` on yaw; the final ramp
 * targets zero velocity, so the camera is still by the time the clip ends — and
 * the three children's durations sum to exactly the requested duration, so the
 * ease-out lands on the cut. The pitch bob is forked (no duration), so it runs
 * under the envelope rather than on the awaited path.
 */

import { describe, it, expect } from 'vitest';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';

describe('dwellDrift', () => {
  it('starts live', () => {
    expect(dwellDrift(10).start).toBe('live');
  });

  it('shapes ease-in → cruise → ease-out-to-rest on yaw, with a forked pitch bob', () => {
    const clip = dwellDrift(10);
    expect(clip.timeline).toHaveLength(2);

    // First entry: forked oscillate — the bob runs under the awaited envelope.
    const forkEntry = clip.timeline[0];
    expect(forkEntry!.kind).toBe('fork');
    if (forkEntry!.kind === 'fork') expect(forkEntry.child.kind).toBe('osc');

    // Second entry: the awaited seq of rate → hold → rate on yaw.
    const seqEntry = clip.timeline[1];
    expect(seqEntry!.kind).toBe('seq');
    if (seqEntry!.kind === 'seq') {
      const [easeIn, cruise, easeOut] = seqEntry.children;
      expect(easeIn!.kind).toBe('rate');
      expect(cruise!.kind).toBe('hold');
      expect(easeOut!.kind).toBe('rate');

      // Ease-in ramps yaw velocity up to a positive cruise rate…
      if (easeIn!.kind === 'rate') {
        expect(easeIn.ch).toBe('yaw');
        expect(easeIn.to).toBeGreaterThan(0);
      }
      // …and ease-out ramps it back to zero, so the camera ends at rest.
      if (easeOut!.kind === 'rate') {
        expect(easeOut.ch).toBe('yaw');
        expect(easeOut.to).toBe(0);
      }
    }
  });

  it('fills exactly the requested duration (ramp + cruise + ramp)', () => {
    const seqEntry = dwellDrift(10).timeline[1];
    if (seqEntry!.kind === 'seq') {
      const total = seqEntry.children.reduce((sum, child) => {
        if (child.kind === 'rate') return sum + child.over;
        if (child.kind === 'hold') return sum + child.sec;
        return sum;
      }, 0);
      expect(total).toBeCloseTo(10);
    }
  });

  it('clamps the ramps so a short dwell still eases in and out without overrunning', () => {
    // 2s is shorter than 2 × RAMP_SEC (3s), so each ramp clamps to half (1s)
    // and the cruise collapses to zero — still a symmetric in/out that fills 2s.
    const seqEntry = dwellDrift(2).timeline[1];
    if (seqEntry!.kind === 'seq') {
      const [easeIn, cruise, easeOut] = seqEntry.children;
      if (easeIn!.kind === 'rate') expect(easeIn.over).toBeCloseTo(1);
      if (cruise!.kind === 'hold') expect(cruise.sec).toBeCloseTo(0);
      if (easeOut!.kind === 'rate') expect(easeOut.over).toBeCloseTo(1);
    }
  });
});
