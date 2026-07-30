/**
 * hashBodyFor — the compose-the-whole-hash test. Per-row `read`/`readAbsent`/
 * `write` behaviour belongs to `hashParamSources.test.ts`; this file's only job
 * is the walk-filter-compose glue, so the one case worth pinning hard is TABLE
 * ORDER — a real bug here (e.g. iterating an object's own keys instead of the
 * array) would silently reorder every multi-param link ever shared.
 */

import { describe, it, expect } from 'vitest';

import { hashBodyFor } from '../../../src/state/url/hashBodyFor';
import { stateAfter } from '../../fixtures/stateAfter';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { manualPausedAtActions } from '../../../src/state/time/enterManualPausedAt';

describe('hashBodyFor', () => {
  it('composes the empty body from the boot state (bare URL)', () => {
    // Every row's write is null at boot: no focus, a live clock, the default
    // orientation. This is the state a fresh page load reaches with no hash at
    // all, so the write side must reproduce that as an empty string, not '#'.
    expect(hashBodyFor(stateAfter())).toBe('');
  });

  it('composes a single param when only focus is set', () => {
    expect(hashBodyFor(stateAfter(requestFocus('m31')))).toBe('focus=m31');
  });

  it('composes a single param when only orientation is set', () => {
    expect(hashBodyFor(stateAfter(setOrientation('galactic')))).toBe('orientation=galactic');
  });

  it('composes focus, t, and orientation in TABLE ORDER regardless of dispatch order', () => {
    // Dispatched out of table order (orientation first, then time, then focus)
    // on purpose: the composed string must still come out focus → t →
    // orientation, because that order is a property of HASH_PARAM_SOURCES, not
    // of which action happened to fire last. Two visitors who reach the same
    // state via different click paths must get byte-identical share links.
    const state = stateAfter(
      setOrientation('galactic'),
      ...manualPausedAtActions(new Date('2000-01-01T12:00:00.000Z')),
      requestFocus('m31'),
    );
    expect(hashBodyFor(state)).toBe('focus=m31&t=2000-01-01T12:00:00.000Z&orientation=galactic');
  });
});
