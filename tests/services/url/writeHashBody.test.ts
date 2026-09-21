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
 * `mode: 'replace'` is exercised directly here (spy on `replaceState` calls
 * through same as `pushState`'s), since it is now a parameter rather than an
 * unobservable implementation choice.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

import { writeHashBody } from '../../../src/services/url/writeHashBody';

describe('writeHashBody', () => {
  let pushState: MockInstance<History['pushState']>;
  let replaceState: MockInstance<History['replaceState']>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    // Spy WITHOUT an implementation: vitest calls through, so the real jsdom
    // push still updates window.location for the next call to read.
    pushState = vi.spyOn(window.history, 'pushState');
    replaceState = vi.spyOn(window.history, 'replaceState');
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

  it("calls replaceState, not pushState, when mode is 'replace'", () => {
    writeHashBody('focus=m31', 'replace');

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(pushState).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#focus=m31');
  });

  it("still skips a redundant write under mode 'replace'", () => {
    writeHashBody('focus=m31');
    writeHashBody('focus=m31', 'replace');

    expect(replaceState).not.toHaveBeenCalled();
  });
});
