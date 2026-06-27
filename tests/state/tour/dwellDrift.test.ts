/**
 * dwellDrift tests — verify the dwell clip is a pair of velocity envelopes (yaw
 * + pitch) synced to the duration it is handed: ease in to a cruise rate, hold,
 * ease out to rest.
 *
 * Both channels run concurrently under `all`, each an awaited `seq([rate, hold,
 * rate])` whose final ramp targets zero velocity — so the camera is still by the
 * time the clip ends. The three children's durations sum to exactly the
 * requested duration, so the ease-out lands on the cut. Pitch cruises gentler
 * than yaw.
 */

import { describe, it, expect } from 'vitest';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import type { Effect } from '../../../src/@types/animation/Effect';

/** Pull the [easeIn, cruise, easeOut] children of the channel's envelope seq. */
function envelopeFor(clip: ReturnType<typeof dwellDrift>, ch: string): Effect[] | null {
  const top = clip.timeline[0];
  if (top?.kind !== 'all') return null;
  for (const child of top.children) {
    if (child.kind === 'seq' && child.children[0]?.kind === 'rate' && child.children[0].ch === ch) {
      return child.children;
    }
  }
  return null;
}

describe('dwellDrift', () => {
  it('starts live', () => {
    expect(dwellDrift(10).start).toBe('live');
  });

  it('runs a yaw and a pitch velocity envelope concurrently under all', () => {
    const top = dwellDrift(10).timeline[0];
    expect(top!.kind).toBe('all');
    if (top!.kind === 'all') {
      expect(top.children).toHaveLength(2);
      expect(top.children.every((c) => c.kind === 'seq')).toBe(true);
    }
  });

  it('eases each channel in to a positive cruise rate and out to rest', () => {
    for (const ch of ['yaw', 'pitch']) {
      const env = envelopeFor(dwellDrift(10), ch);
      expect(env).not.toBeNull();
      const [easeIn, cruise, easeOut] = env!;
      expect(easeIn!.kind).toBe('rate');
      expect(cruise!.kind).toBe('hold');
      expect(easeOut!.kind).toBe('rate');
      if (easeIn!.kind === 'rate') expect(easeIn.to).toBeGreaterThan(0);
      if (easeOut!.kind === 'rate') expect(easeOut.to).toBe(0);
    }
  });

  it('cruises pitch gentler than yaw', () => {
    const yaw = envelopeFor(dwellDrift(10), 'yaw')![0];
    const pitch = envelopeFor(dwellDrift(10), 'pitch')![0];
    if (yaw!.kind === 'rate' && pitch!.kind === 'rate') {
      expect(pitch.to).toBeLessThan(yaw.to);
    }
  });

  it('fills exactly the requested duration (ramp + cruise + ramp)', () => {
    const env = envelopeFor(dwellDrift(10), 'yaw')!;
    const total = env.reduce((sum, child) => {
      if (child.kind === 'rate') return sum + child.over;
      if (child.kind === 'hold') return sum + child.sec;
      return sum;
    }, 0);
    expect(total).toBeCloseTo(10);
  });

  it('honours custom ramp and cruise arguments', () => {
    const env = envelopeFor(dwellDrift(10, 2, 0.5), 'yaw')!;
    const [easeIn, cruise] = env;
    if (easeIn!.kind === 'rate') {
      expect(easeIn.over).toBeCloseTo(2);
      expect(easeIn.to).toBeCloseTo(0.5);
    }
    if (cruise!.kind === 'hold') expect(cruise.sec).toBeCloseTo(6); // 10 − 2×2
  });

  it('clamps the ramps so a short dwell still eases in and out without overrunning', () => {
    // 2s is shorter than 2 × default ramp (3s), so each ramp clamps to half (1s)
    // and the cruise collapses to zero — still a symmetric in/out that fills 2s.
    const env = envelopeFor(dwellDrift(2), 'yaw')!;
    const [easeIn, cruise, easeOut] = env;
    if (easeIn!.kind === 'rate') expect(easeIn.over).toBeCloseTo(1);
    if (cruise!.kind === 'hold') expect(cruise.sec).toBeCloseTo(0);
    if (easeOut!.kind === 'rate') expect(easeOut.over).toBeCloseTo(1);
  });
});
