/**
 * HASH_PARAM_SOURCES — per-row behaviour.
 *
 * Each row is exercised through its own `read` / `readAbsent` / `write`, with no
 * saga and no DOM: the arms return actions and `write` takes a `RootState`, so a
 * plain `rootReducer` fold builds every state these need. The table's CONTENTS
 * (which keys exist, in what order, with which `deepLink` flags) are
 * deliberately NOT asserted — that would be a registry mirror, failing on every
 * legitimate row addition and on no real bug.
 *
 * The J2000 epoch is the fixed point the clock assertions use: JD 2451545.0 is
 * 2000-01-01T12:00:00Z by definition, so the expected values are astronomy, not
 * a re-run of the conversion the source performs.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

import { HASH_PARAM_SOURCES } from '../../../src/state/url/hashParamSources';
import type { RootState } from '../../../src/store/types';
import { stateAfter } from '../../fixtures/stateAfter';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { requestSelect } from '../../../src/state/selection/requestSelect';
import { clearSelection } from '../../../src/state/selection/selectionSlice';
import { setSelectionRow } from '../../../src/state/selectionRows/selectionRowsSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';
import type { StructureInfo } from '../../../src/@types/data/structure/StructureInfo';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

const focusSource = HASH_PARAM_SOURCES.find((source) => source.key === 'focus')!;
const timeSource = HASH_PARAM_SOURCES.find((source) => source.key === 't')!;
const orientationSource = HASH_PARAM_SOURCES.find((source) => source.key === 'orientation')!;

/** JD 2451545.0 — the J2000.0 epoch, and the instant it names. */
const J2000_ISO = '2000-01-01T12:00:00.000Z';
const J2000_UNIX_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

const virgoRow: StructureInfo = {
  type: 'structure',
  id: 'cluster-virgo-m87',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [0, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const earthRow: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusM: 6371000,
};

function focusedOn(row: SelectionRow): RootState {
  return stateAfter(setSelectionRow({ slot: 'focus', row }));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('focus row', () => {
  it('reads a value as a pinned card plus a camera fly', () => {
    // Arriving by URL must look the same as a scene click (requestSelect pins
    // the InfoCard) plus a fly (requestFocus moves the camera).
    expect(focusSource.read('m31')).toEqual([requestSelect('m31'), requestFocus('m31')]);
  });

  it('reads an absent value as a cleared selection', () => {
    expect(focusSource.readAbsent()).toEqual([clearSelection()]);
  });

  it('writes the pending id while a request is still resolving', () => {
    // A galaxy/star request parks in `resolveFocusRefDeferring` until its
    // catalog pulses, leaving the resolved slot null for the whole boot window.
    // Publishing the in-flight id is what keeps a cold deep link on the URL.
    expect(focusSource.write(stateAfter(requestFocus('m31')))).toBe('m31');
  });

  it('writes the encoded target once the request has resolved', () => {
    expect(focusSource.write(focusedOn(virgoRow))).toBe('cluster-virgo-m87');
  });

  it('writes the pending id AHEAD of an already-resolved target', () => {
    // Precedence, not fallback. Switching focus while the previous target is
    // still resolved would otherwise republish the OLD id until the new one
    // landed, so Back would restore a URL that never matched the screen.
    const state = stateAfter(
      setSelectionRow({ slot: 'focus', row: virgoRow }),
      requestFocus('m31'),
    );
    expect(focusSource.write(state)).toBe('m31');
  });

  it('writes nothing for the Earth home body (a bare URL is home)', () => {
    expect(focusSource.write(focusedOn(earthRow))).toBeNull();
  });
});

describe('t row', () => {
  it('reads an ISO instant as manual-and-paused at that moment', () => {
    const actions = timeSource.read(J2000_ISO);
    expect(actions.map((action) => action.type)).toEqual(['time/setSimDays', 'time/pause']);
    expect(actions[0]).toMatchObject({ payload: { simDays: CONST_J2000 } });
  });

  it('reads an unparseable value as no change at all', () => {
    // The hash is external input; a hand-typed timestamp is not a reason to
    // move the clock somewhere arbitrary.
    expect(timeSource.read('not-a-timestamp')).toEqual([]);
  });

  it('reads an absent value as live-at-now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(J2000_UNIX_MS);
    const actions = timeSource.readAbsent();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'time/goLive', payload: { simDays: CONST_J2000 } });
  });

  it('writes a manual anchor as an ISO instant', () => {
    const actions = timeSource.read(J2000_ISO);
    expect(timeSource.write(stateAfter(...actions))).toBe(J2000_ISO);
  });

  it('writes nothing while the clock is live', () => {
    // The boot state is live, so a bare URL is what a never-touched clock means.
    expect(timeSource.write(stateAfter())).toBeNull();
  });
});

describe('orientation row', () => {
  it('reads a recognised frame as a snap', () => {
    expect(orientationSource.read('galactic')).toEqual([setOrientation('galactic')]);
  });

  it('reads a junk frame as no change at all', () => {
    expect(orientationSource.read('polaris')).toEqual([]);
  });

  it('reads an absent value as the default frame', () => {
    // Back/forward off an `#orientation=…` entry must return the pole to the
    // default, not leave the previous entry's frame in place.
    expect(orientationSource.readAbsent()).toEqual([setOrientation(DEFAULT_ORIENTATION)]);
  });
});
