import { describe, it, expect } from 'vitest';
import { createClipOpacityChannel } from '../../../src/services/animation/clipOpacityChannel';

describe('createClipOpacityChannel', () => {
  it('factorOf returns 1 for an untouched layer', () => {
    const channel = createClipOpacityChannel(1000);
    expect(channel.factorOf('survey', 1000)).toBe(1);
    expect(channel.factorOf('cosmicWebFilaments', 1000)).toBe(1);
    expect(channel.factorOf('flow', 1000)).toBe(1);
  });

  it('fadeTo to 0 then factorOf at end returns 0 (snap, durationMs=0)', () => {
    const channel = createClipOpacityChannel(1000);
    // durationMs=0 → instant snap via FadeController's Math.max(0, durationMs) path.
    channel.fadeTo('survey', 0, 0, 1000);
    expect(channel.factorOf('survey', 1000)).toBe(0);
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
});
