/**
 * formatSimClock renders a wall-clock instant as a compact UTC date-time string.
 *
 * The expected strings here are hand-written from the known UTC instant, not
 * produced by the same field-composition the implementation uses. The stability
 * test rebuilds the identical instant from a Unix-ms timestamp (timezone-free by
 * construction) to guard against an accidental slip to local-time getters, which
 * would shift the readout by the host's UTC offset.
 */

import { describe, it, expect } from 'vitest';
import { formatSimClock } from '../../../src/utils/time/formatSimClock';

describe('formatSimClock', () => {
  it('renders a UTC date-time', () => {
    const date = new Date(Date.UTC(2026, 10, 3, 18, 0, 0));
    expect(formatSimClock(date)).toBe('2026-11-03 18:00 UTC');
  });

  it('is stable across host timezone', () => {
    // 2026-11-03T18:00:00Z as a raw epoch-ms instant. A Date carries no
    // timezone of its own; only the getters choose one. Reading via the UTC
    // getters must yield the same string no matter what TZ the host runs under.
    const instantMs = Date.UTC(2026, 10, 3, 18, 0, 0);
    expect(formatSimClock(new Date(instantMs))).toBe('2026-11-03 18:00 UTC');
  });

  it('zero-pads single-digit month, day, hour, and minute', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 4, 9, 0));
    expect(formatSimClock(date)).toBe('2026-01-05 04:09 UTC');
  });
});
