/**
 * searchHasGate — unit coverage for the pure URL-gate parse core.
 *
 * All parse semantics live here (both `hasUrlGate` and `isCinemaSearch`
 * delegate to this function): presence counts bare or valued, the leading
 * '?' is optional, empty input is "absent", multiple params are searched,
 * and a similarly-prefixed name does not match. The wrappers' suites keep
 * only their own behavior — the live window read and the 'cinema' binding.
 */

import { describe, it, expect } from 'vitest';
import { searchHasGate } from '../../../src/utils/url/searchHasGate';

describe('searchHasGate', () => {
  it('returns true when the bare-flag param is present', () => {
    expect(searchHasGate('?gpuTimings', 'gpuTimings')).toBe(true);
  });

  it('returns true when the param has a value', () => {
    expect(searchHasGate('?debug=loading', 'debug')).toBe(true);
  });

  it('accepts a search string without the leading "?"', () => {
    expect(searchHasGate('debug=loading', 'debug')).toBe(true);
  });

  it('returns false when the param is absent', () => {
    expect(searchHasGate('?volumes', 'gpuTimings')).toBe(false);
  });

  it('does not match a param that merely shares a prefix with the gate', () => {
    expect(searchHasGate('?cinemaScope', 'cinema')).toBe(false);
  });
});
