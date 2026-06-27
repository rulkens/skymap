/**
 * dwellDrift tests — verify the dwell clip drives yaw and pitch with the right
 * effects, synced to the duration it is handed.
 *
 * Yaw is a single finite `spin` over the whole dwell with `inOut` ease (gentle
 * start, settles by the cut, ends displaced — an orbit). Pitch is an
 * amplitude-enveloped `oscillate`: a zero-mean bob whose amplitude fades in/out
 * over the ramp, so it returns to centre. Both run concurrently under `all`.
 */

import { describe, it, expect } from 'vitest';
import { dwellDrift } from '../../../src/state/tour/dwellDrift';
import type { Effect } from '../../../src/@types/animation/Effect';

/** The two channel effects inside the clip's top-level `all`. */
function effectsOf(clip: ReturnType<typeof dwellDrift>): Effect[] | null {
  const top = clip.timeline[0];
  return top?.kind === 'all' ? top.children : null;
}

describe('dwellDrift', () => {
  it('starts live', () => {
    expect(dwellDrift(10).start).toBe('live');
  });

  it('drives yaw with a finite inOut spin and pitch with an eased oscillation', () => {
    const effects = effectsOf(dwellDrift(10));
    expect(effects).not.toBeNull();
    expect(effects).toHaveLength(2);

    const spin = effects!.find((e) => e.kind === 'spin');
    const osc = effects!.find((e) => e.kind === 'osc');

    // Yaw: a finite (non-looping) spin over the whole dwell, eased in and out.
    expect(spin).toBeDefined();
    if (spin?.kind === 'spin') {
      expect(spin.ch).toBe('yaw');
      expect(spin.over).toBe(10);
      expect(spin.ease).toBe('inOut');
      expect(spin.loop).toBeUndefined();
      expect(spin.by).toBeGreaterThan(0);
    }

    // Pitch: an amplitude-enveloped oscillation over the dwell, returning to centre.
    expect(osc).toBeDefined();
    if (osc?.kind === 'osc') {
      expect(osc.ch).toBe('pitch');
      expect(osc.over).toBe(10);
      expect(osc.fade).toBeGreaterThan(0);
    }
  });

  it('sizes the yaw rotation so the average speed is the cruise rate', () => {
    // by = cruiseRate × durationSec ⇒ by / durationSec === cruiseRate.
    const spin = effectsOf(dwellDrift(10, 1.5, 0.2))!.find((e) => e.kind === 'spin');
    if (spin?.kind === 'spin') expect(spin.by / spin.over).toBeCloseTo(0.2);
  });

  it('clamps the pitch fade so a short dwell still fades symmetrically', () => {
    // 2s is shorter than 2 × default ramp (3s), so the fade clamps to half (1s).
    const osc = effectsOf(dwellDrift(2))!.find((e) => e.kind === 'osc');
    if (osc?.kind === 'osc') expect(osc.fade).toBeCloseTo(1);
  });
});
