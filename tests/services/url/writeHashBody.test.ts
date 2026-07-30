// @vitest-environment jsdom
/**
 * writeHashBody — the three decisions the function actually makes: skip a
 * redundant push, drop the `#` for an empty body, and keep the query string.
 *
 * jsdom gives a real `history.pushState` that really moves `window.location`, so
 * the spy counts calls while the URL still advances underneath. A stubbed
 * `pushState` would leave the location frozen and the compare-and-skip would look
 * broken for a reason that has nothing to do with the code.
 *
 * Not tested here: that `pushState` is used rather than `replaceState`. Vitest
 * cannot observe the history stack's depth, so the only assertion available would
 * be "the spy on pushState fired", which the skip test already implies.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

import { writeHashBody } from '../../../src/services/url/writeHashBody';

describe('writeHashBody', () => {
  let pushState: MockInstance<History['pushState']>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    // Spy WITHOUT an implementation: vitest calls through, so the real jsdom
    // push still updates window.location for the next call to read.
    pushState = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips the push when the URL already carries the body', () => {
    writeHashBody('focus=m31');
    writeHashBody('focus=m31');

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#focus=m31');
  });

  it("drops the '#' entirely for an empty body", () => {
    writeHashBody('focus=m31');
    writeHashBody('');

    expect(pushState).toHaveBeenLastCalledWith(null, '', '/');
    expect(window.location.href).not.toContain('#');
  });

  it('preserves the query string', () => {
    // The `?` gates (?tour, ?cinema, ?perf, ?gpuTimings) are read live from
    // window.location.search, so a write that rebuilt the base from pathname
    // alone would end a tour the moment the visitor focused something.
    window.history.replaceState(null, '', '/?tour');

    writeHashBody('focus=m31');

    expect(window.location.search).toBe('?tour');
    expect(window.location.hash).toBe('#focus=m31');
  });
});
