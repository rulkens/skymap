import { describe, it, expect } from 'vitest';
import { createClipOpacityChannel } from '../../../src/services/animation/clipOpacityChannel';

describe('createClipOpacityChannel', () => {
  it('factorOf returns 1 for an untouched layer', () => {
    const channel = createClipOpacityChannel(1000);
    expect(channel.factorOf('survey', 1000)).toBe(1);
    expect(channel.factorOf('filaments', 1000)).toBe(1);
    expect(channel.factorOf('flow', 1000)).toBe(1);
  });

  it('fadeTo to 0 then factorOf at end returns 0 (snap, durationMs=0)', () => {
    const channel = createClipOpacityChannel(1000);
    // durationMs=0 → instant snap via FadeController's Math.max(0, durationMs) path.
    channel.fadeTo('survey', 0, 0, 1000);
    expect(channel.factorOf('survey', 1000)).toBe(0);
  });

  it('fadeTo animates between 1 and 0 over the duration', () => {
    const channel = createClipOpacityChannel(0);
    // Fade from default 1 → 0 over 1000 ms, starting at t=0.
    channel.fadeTo('filaments', 0, 1000, 0);
    // At the midpoint (t=500), smoothstep yields 0.5 → factor ≈ 0.5.
    const mid = channel.factorOf('filaments', 500);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // At end of ramp the target is fully reached.
    expect(channel.factorOf('filaments', 1000)).toBeCloseTo(0, 5);
  });

  it('reset restores every faded layer to 1', () => {
    const channel = createClipOpacityChannel(0);
    // Fade two different layers to 0.
    channel.fadeTo('survey', 0, 0, 0);
    channel.fadeTo('flow', 0, 0, 0);
    expect(channel.factorOf('survey', 0)).toBe(0);
    expect(channel.factorOf('flow', 0)).toBe(0);
    // After reset, both keys have no controller → default 1.
    channel.reset();
    expect(channel.factorOf('survey', 0)).toBe(1);
    expect(channel.factorOf('flow', 0)).toBe(1);
  });

  it('isAnimating is true mid-ramp, false after duration', () => {
    const channel = createClipOpacityChannel(0);
    channel.fadeTo('structureRing', 0, 1000, 0);
    // Mid-ramp: still animating.
    expect(channel.isAnimating(500)).toBe(true);
    // At or past the end of the ramp: settled.
    expect(channel.isAnimating(1000)).toBe(false);
    expect(channel.isAnimating(1001)).toBe(false);
  });

  it('fadeTo without nowMs starts at the last ticked frame time', () => {
    const channel = createClipOpacityChannel();
    channel.tick(1000);
    // No nowMs argument — the ramp must anchor at the last tick (t=1000),
    // not at the wall clock.
    channel.fadeTo('survey', 0, 1000);
    expect(channel.factorOf('survey', 1000)).toBeCloseTo(1, 5);
    expect(channel.factorOf('survey', 1500)).toBeCloseTo(0.5, 5); // smoothstep midpoint
    expect(channel.factorOf('survey', 2000)).toBeCloseTo(0, 5);
  });

  it('factorOf without a time reads at the last ticked frame time', () => {
    const channel = createClipOpacityChannel();
    channel.fadeTo('survey', 0, 1000, 1000);
    channel.tick(1500);
    // Argless read must equal an explicit read at the last tick's time.
    expect(channel.factorOf('survey')).toBe(channel.factorOf('survey', 1500));
    expect(channel.factorOf('survey')).toBeCloseTo(0.5, 5);
  });

  it('a second fadeTo on the same layer retargets from the current value', () => {
    const channel = createClipOpacityChannel(0);
    // First ramp: 1 → 0 over 1000 ms starting at t=0.
    channel.fadeTo('milkyWayDisk', 0, 1000, 0);
    // At t=500 the controller has smoothstepped to ~0.5.
    const midValue = channel.factorOf('milkyWayDisk', 500);
    expect(midValue).toBeCloseTo(0.5, 1);

    // Retarget back to 1, over another 1000 ms from t=500.
    channel.fadeTo('milkyWayDisk', 1, 1000, 500);
    // Right at the retarget moment the factor should still be ~0.5
    // (FadeController captures currentOpacity as the new source, no snap).
    expect(channel.factorOf('milkyWayDisk', 500)).toBeCloseTo(midValue, 1);

    // By t=1500 (end of the second 1000 ms ramp) we expect to be at 1.
    expect(channel.factorOf('milkyWayDisk', 1500)).toBeCloseTo(1, 5);

    // Confirm the ramp climbs — factor at t=1000 is above the mid value.
    const laterValue = channel.factorOf('milkyWayDisk', 1000);
    expect(laterValue).toBeGreaterThan(midValue);
  });
});
