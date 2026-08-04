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
import { focusId } from '../../../src/utils/animation/focusId';

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
      expect(spin.ease).toBe('easeInOutCubic');
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
    const spin = effectsOf(dwellDrift(10, { cruiseRate: 0.2 }))!.find((e) => e.kind === 'spin');
    if (spin?.kind === 'spin') expect(spin.by / spin.over).toBeCloseTo(0.2);
  });

  it('applies an authored rampSec to the pitch fade', () => {
    const osc = effectsOf(dwellDrift(10, { rampSec: 3 }))!.find((e) => e.kind === 'osc');
    if (osc?.kind === 'osc') expect(osc.fade).toBeCloseTo(3);
  });

  it('clamps the pitch fade so a short dwell still fades symmetrically', () => {
    // 2s is shorter than 2 × default ramp (3s), so the fade clamps to half (1s).
    const osc = effectsOf(dwellDrift(2))!.find((e) => e.kind === 'osc');
    if (osc?.kind === 'osc') expect(osc.fade).toBeCloseTo(1);
  });

  it('fits an integer number of full bob cycles to the dwell window', () => {
    // The sine must return to centre exactly on the cut, or the amplitude
    // fade drags the camera back from mid-swing (a visible vertical lurch at
    // the dwell's end). The period stretches to the nearest integer-cycle fit
    // of the ~14s target: 12s dwell → one 12s cycle; 30s dwell → two 15s cycles.
    const osc12 = effectsOf(dwellDrift(12))!.find((e) => e.kind === 'osc');
    if (osc12?.kind === 'osc') expect(osc12.period).toBeCloseTo(12);

    const osc30 = effectsOf(dwellDrift(30))!.find((e) => e.kind === 'osc');
    if (osc30?.kind === 'osc') expect(osc30.period).toBeCloseTo(15);

    // A dwell shorter than the target still gets one full (faster) cycle
    // rather than a fraction of a slow one.
    const osc6 = effectsOf(dwellDrift(6))!.find((e) => e.kind === 'osc');
    if (osc6?.kind === 'osc') expect(osc6.period).toBeCloseTo(6);
  });

  it('with spinTo emits an unresolved spinToId on the yaw layer', () => {
    const id = focusId('m31');
    const effects = effectsOf(dwellDrift(10, { spinTo: id, turns: -1 }));
    expect(effects).not.toBeNull();
    expect(effects).toHaveLength(2);

    // No plain 'spin' layer — spinTo replaces it, leaving resolution to
    // resolveClipFoci at play time (same as any other *Id effect).
    expect(effects!.find((e) => e.kind === 'spin')).toBeUndefined();

    const spinTo = effects!.find((e) => e.kind === 'spinToId');
    expect(spinTo).toBeDefined();
    if (spinTo?.kind === 'spinToId') {
      expect(spinTo.id).toBe(id);
      expect(spinTo.over).toBe(10);
      expect(spinTo.turns).toBe(-1);
      expect(spinTo.ease).toBe('easeInOutCubic');
    }

    // Pitch bob is untouched by spinTo.
    const osc = effects!.find((e) => e.kind === 'osc');
    expect(osc).toBeDefined();
    if (osc?.kind === 'osc') {
      expect(osc.ch).toBe('pitch');
      expect(osc.over).toBe(10);
    }
  });

  it('with both spinTo and cruiseRate throws', () => {
    expect(() => dwellDrift(10, { spinTo: focusId('m31'), cruiseRate: 0.2 })).toThrow();
  });
});
