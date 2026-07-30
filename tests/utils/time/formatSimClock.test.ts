/**
 * formatSimClock renders a wall-clock instant as a compact UTC date-time string.
 *
 * The expected strings here are hand-written from the known UTC instant, not
 * produced by the same field-composition the implementation uses. The stability
 * test stubs the Date's LOCAL getters with sentinel values and asserts the
 * readout ignores them entirely — a guard that fails on any slip to local-time
 * getters no matter what TZ the host runs under.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatSimClock } from '../../../src/utils/time/formatSimClock';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatSimClock', () => {
  it('renders a UTC date-time', () => {
    const date = new Date(Date.UTC(2026, 10, 3, 18, 0, 0));
    expect(formatSimClock(date)).toBe('2026-11-03 18:00 UTC');
  });

  it('reads UTC fields, never the host-local ones', () => {
    // We stub the LOCAL getters (getFullYear/getMonth/... — no UTC in the name)
    // to return sentinel values that appear in NO valid rendering of any
    // instant. A correct implementation reads getUTC* and ignores these stubs;
    // a regressed local-getter implementation would emit the sentinel string.
    //
    // Why sentinels and not `process.env.TZ = 'America/New_York'`: V8 caches the
    // process timezone, so mutating TZ mid-run doesn't reliably re-zone Dates,
    // and CI runs under UTC where local and UTC fields coincide — a local-getter
    // regression would silently pass. Stubbing makes local != UTC unconditionally,
    // independent of the host zone, so the assertion genuinely discriminates.
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(1999);
    vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(0);
    vi.spyOn(Date.prototype, 'getDate').mockReturnValue(1);
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(7);
    vi.spyOn(Date.prototype, 'getMinutes').mockReturnValue(42);

    const date = new Date(Date.UTC(2026, 10, 3, 18, 0, 0));
    // Sentinel rendering would be '1999-01-01 07:42 UTC'; the UTC one is:
    expect(formatSimClock(date)).toBe('2026-11-03 18:00 UTC');
  });

  it('zero-pads single-digit month, day, hour, and minute', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 4, 9, 0));
    expect(formatSimClock(date)).toBe('2026-01-05 04:09 UTC');
  });
});
