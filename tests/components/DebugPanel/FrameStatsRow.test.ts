// @vitest-environment jsdom

/**
 * FrameStatsRow — verify the always-on readout renders the idle placeholder vs.
 * the live fps number, and that it POLLS the `frameStats()` getter (rather than
 * reading it once) so a later frame's numbers surface without a per-frame
 * subscription. Fake timers advance the 250 ms poll.
 *
 * Project convention: `.test.ts` + `createElement` (no JSX) — the vitest
 * `include` glob is `tests/**\/*.test.ts`.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { FrameStatsRow } from '../../../src/components/DebugPanel/FrameStatsRow';
import type { FrameStats } from '../../../src/@types/engine/FrameStats';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FrameStatsRow', () => {
  it('renders the idle placeholder when idle, still showing cpuMs', () => {
    const stats: FrameStats = { fps: 0, cpuMs: 2.3, idle: true };
    const { container } = render(createElement(FrameStatsRow, { frameStats: () => stats }));
    expect(container.textContent).toContain('FPS —');
    expect(container.textContent).toContain('CPU 2.3 ms');
    expect(container.textContent).toContain('(idle)');
  });

  it('polls the getter — a later frame surfaces after the interval', () => {
    vi.useFakeTimers();
    let current: FrameStats = { fps: 0, cpuMs: 0, idle: true };
    const { container } = render(createElement(FrameStatsRow, { frameStats: () => current }));

    // First render read the idle snapshot.
    expect(container.textContent).toContain('FPS —');

    // A frame runs; the poll (not a subscription) picks it up after ~250 ms.
    current = { fps: 60, cpuMs: 4.5, idle: false };
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.textContent).toContain('FPS 60');
    expect(container.textContent).toContain('CPU 4.5 ms');
  });
});
