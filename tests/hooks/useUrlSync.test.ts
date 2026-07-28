// @vitest-environment jsdom
/**
 * useUrlSync — test coverage.
 *
 * Two scopes:
 *
 *   1. `computeDesiredHash` — pure function, fully testable without DOM or
 *      Redux. Runs in node or jsdom env equally.
 *
 *   2. Hook integration — rendered against a real Redux store via
 *      `createAppStore` + a `<Provider>` wrapper. Tests assert that:
 *      (a) a `#focus=<id>` hash on mount dispatches `requestFocus(id)`;
 *      (b) an empty hash on mount does NOT dispatch `clearSelection()` —
 *          the empty-hash clear is gated to hashchange only;
 *      (c) a hashchange to `#focus=<id>` dispatches `requestFocus(id)`;
 *      (d) a hashchange to empty dispatches `clearSelection()`.
 *
 * The URL WRITE (Effect B) is verified indirectly: it calls
 * `history.pushState`, which jsdom honours on the `window.location`
 * object. A focused FocusableTarget in the store causes the hash to be
 * written; that assertion lives in the integration block below.
 *
 * `initialPendingFromHash` was the old drain-pending helper; it no longer
 * exists. Its tests have been removed along with the function.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { computeDesiredHash } from '../../src/hooks/useUrlSync';
import { useUrlSync } from '../../src/hooks/useUrlSync';
import { HASH_PARAM_SOURCES } from '../../src/hooks/hashParamSources';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import type { BodyInfo } from '../../src/@types/engine/BodyInfo';
import type { TimeState } from '../../src/@types/time/TimeState';
import type { AppDispatch } from '../../src/store/types';
import type { UnknownAction } from '@reduxjs/toolkit';
import { Source } from '../../src/data/sources';
import { createTestStore as createAppStore } from '../support/createTestStore';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import { requestFocus } from '../../src/state/selection/requestFocus';
import { clearSelection } from '../../src/state/selection/selectionSlice';
import { setOrientation } from '../../src/state/settings/settingsSlice';
import timeReducer, { setSimDays, pause } from '../../src/state/time/timeSlice';
import { deriveSimDays } from '../../src/utils/time/deriveSimDays';
import { unixMsToJulianDays } from '../../src/utils/time/unixMsToJulianDays';
import { CONST_J2000 } from '../../src/data/time/constJ2000';
import { parseHashParams } from '../../src/utils/url/parseHashParams';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeGalaxy(): GalaxyInfo {
  return {
    type: 'galaxyCatalog',
    source: Source.SDSS,
    objID: 1234567890n,
  } as unknown as GalaxyInfo;
}

function makeStructure(id: string): StructureInfo {
  return {
    type: 'structure',
    id,
    name: id,
    category: 'cluster',
    worldPos: [0, 0, 0],
    featured: true,
    physicalRadiusMpc: 2,
  };
}

function makeBody(id: string): BodyInfo {
  return { type: 'body', id, name: id } as unknown as BodyInfo;
}

// A known instant, seeded from a Unix-ms value so its JD lands on a clean
// millisecond and the compose→parse round-trip is exact.
const KNOWN_UNIX_MS = Date.UTC(2026, 10, 3, 18, 0, 0);
const KNOWN_JD = unixMsToJulianDays(KNOWN_UNIX_MS);
const KNOWN_ISO = new Date(KNOWN_UNIX_MS).toISOString(); // 2026-11-03T18:00:00.000Z

function manualTime(simDays = KNOWN_JD): TimeState {
  return {
    mode: 'manual',
    anchor: { simDays, realMs: 1000 },
    rateIndex: 3,
    direction: 1,
    paused: false,
  };
}

function liveTime(): TimeState {
  return {
    mode: 'live',
    anchor: { simDays: CONST_J2000, realMs: 0 },
    rateIndex: 3,
    direction: 1,
    paused: false,
  };
}

// A dispatch that records the actions it receives — lets a source's `read` be
// exercised in isolation (no store, no DOM) and its dispatches asserted.
function collectingDispatch(): { dispatch: AppDispatch; actions: UnknownAction[] } {
  const actions: UnknownAction[] = [];
  const dispatch = ((action: UnknownAction) => {
    actions.push(action);
    return action;
  }) as unknown as AppDispatch;
  return { dispatch, actions };
}

const tSource = HASH_PARAM_SOURCES.find((s) => s.key === 't')!;
const orientationSource = HASH_PARAM_SOURCES.find((s) => s.key === 'orientation')!;

// ── computeDesiredHash ────────────────────────────────────────────────────

describe('computeDesiredHash (unified)', () => {
  it('returns empty body when focus is null', () => {
    const out = computeDesiredHash({ focused: null, orientation: 'ecliptic', currentHash: '' });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('returns focus=<id> when focused is a galaxy', () => {
    const out = computeDesiredHash({
      focused: makeGalaxy(),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toMatch(/^focus=/);
    expect(out.matches).toBe(false);
  });

  it('writes focus=<id> when focused is a structure', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('focus=cluster-virgo-m87');
    expect(out.matches).toBe(false);
  });

  it('omits focus for the Earth home body (bare URL is home)', () => {
    const out = computeDesiredHash({
      focused: makeBody('earth'),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('writes focus=body-<id> for a non-home body', () => {
    const out = computeDesiredHash({
      focused: makeBody('jupiter'),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('focus=body-jupiter');
    expect(out.matches).toBe(false);
  });

  it('short-circuits when currentHash already matches a structure body', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      orientation: 'ecliptic',
      currentHash: '#focus=cluster-virgo-m87',
    });
    expect(out.matches).toBe(true);
  });

  it('short-circuits when currentHash already matches the empty body', () => {
    const out = computeDesiredHash({ focused: null, orientation: 'ecliptic', currentHash: '' });
    expect(out.matches).toBe(true);
  });

  it('composes focus through the param seam', () => {
    // The body is now composed over HASH_PARAM_SOURCES, not hard-coded. A
    // structure focus must still surface as the single `focus=<id>` param —
    // proof the seam preserves the on-URL shape for the one existing source.
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('focus=cluster-virgo-m87');
  });
});

// ── Hook integration ──────────────────────────────────────────────────────

/**
 * Build a real store and a Provider wrapper for renderHook.
 *
 * The store is seeded with just the settings slice; the selection slice
 * starts empty (no focused target). We spy on `store.dispatch` to assert
 * which actions the hook fires.
 */
function makeStoreAndWrapper() {
  const { store } = createAppStore({ settings: buildInitialSettings() });
  const dispatchSpy = vi.spyOn(store, 'dispatch');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  return { store, dispatchSpy, wrapper };
}

describe('useUrlSync hook integration', () => {
  // Save and restore location.hash around each test so tests are isolated.
  let originalHash: string;

  beforeEach(() => {
    originalHash = window.location.hash;
  });

  afterEach(() => {
    // jsdom allows hash assignment but ignores pushState on location.hash
    // for history-path purposes — resetting via href is the reliable form.
    window.location.hash = originalHash;
    vi.restoreAllMocks();
  });

  it('dispatches requestFocus on mount when hash is #focus=<id>', () => {
    window.location.hash = '#focus=m31';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(requestFocus('m31'));
  });

  it('the mount read commits the URL frame via setOrientation on isInitial', () => {
    // Boot ordering, at the React-mount layer: a `#orientation=<frame>` deep
    // link must be COMMITTED on the initial mount pass (isInitial), so the
    // engine's later async bootstrap seed and the first produced frame both
    // resolve B(t) in the URL's frame. Unlike `focus` (which suppresses its
    // clear on the mount pass), the orientation source has no boot-suppression
    // arm — a view preference applies on first load. It is a snap
    // (setOrientation), never `requestOrientationChange`, so the mount read can
    // never start a frameTween.
    window.location.hash = '#orientation=galactic';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(setOrientation('galactic'));
    expect(calls.some((a) => (a as UnknownAction).type === 'orientation/request')).toBe(false);
  });

  it('does NOT dispatch clearSelection on mount when hash is empty', () => {
    // The empty-hash → clearSelection branch is gated to hashchange events
    // only. A normal page load with no hash should not fire clearSelection.
    window.location.hash = '';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).not.toContainEqual(clearSelection());
  });

  it('dispatches requestFocus on hashchange to #focus=<id>', () => {
    window.location.hash = '';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    // Clear mount-time dispatch noise.
    dispatchSpy.mockClear();

    act(() => {
      window.location.hash = '#focus=cluster-virgo-m87';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(requestFocus('cluster-virgo-m87'));
  });

  it('dispatches clearSelection on hashchange to empty hash', () => {
    window.location.hash = '#focus=m31';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    dispatchSpy.mockClear();

    act(() => {
      window.location.hash = '';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(clearSelection());
  });

  it('removes the hashchange listener on unmount', () => {
    window.location.hash = '';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    const { unmount } = renderHook(() => useUrlSync(), { wrapper });
    unmount();
    dispatchSpy.mockClear();

    // After unmount, a hashchange should not dispatch anything from this hook.
    act(() => {
      window.location.hash = '#focus=pgc-1234';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

// ── The `t` (sim-clock instant) param source ────────────────────────────────

describe('t param source — compose (write)', () => {
  it('emits t=<ISO> in manual mode', () => {
    // focus is null, so the body is the `t` param alone.
    const out = computeDesiredHash({
      focused: null,
      time: manualTime(),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe(`t=${KNOWN_ISO}`);
  });

  it('emits nothing in live mode', () => {
    const out = computeDesiredHash({
      focused: null,
      time: liveTime(),
      orientation: 'ecliptic',
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('');
  });

  it('emits nothing when no time is supplied (focus-only caller)', () => {
    const out = computeDesiredHash({ focused: null, orientation: 'ecliptic', currentHash: '' });
    expect(out.desiredHashBody).toBe('');
  });
});

describe('t param source — parse (read)', () => {
  it('restores manual + paused at the instant', () => {
    const { dispatch, actions } = collectingDispatch();
    tSource.read({ value: KNOWN_ISO, isInitial: true, dispatch });

    // setSimDays then pause, in that order.
    expect(actions.map((a) => a.type)).toEqual(['time/setSimDays', 'time/pause']);
    expect(actions[0]).toMatchObject({ payload: { simDays: KNOWN_JD } });

    // Replaying the dispatched actions from a live clock lands in manual+paused
    // and derives back to exactly the shared instant (paused ⇒ nowMs is inert).
    let state = liveTime();
    for (const action of actions) state = timeReducer(state, action);
    expect(state.mode).toBe('manual');
    expect(state.paused).toBe(true);
    expect(deriveSimDays(state, 9_999_999)).toBe(KNOWN_JD);
  });

  it('ignores an unparseable value and stays live (no dispatch)', () => {
    const { dispatch, actions } = collectingDispatch();
    tSource.read({ value: 'not-a-timestamp', isInitial: true, dispatch });
    expect(actions).toHaveLength(0);
  });

  it('ignores an absent value (bare URL = now)', () => {
    const { dispatch, actions } = collectingDispatch();
    tSource.read({ value: undefined, isInitial: true, dispatch });
    tSource.read({ value: '', isInitial: false, dispatch });
    expect(actions).toHaveLength(0);
  });
});

describe('focus + t on the &-seam (round-trip)', () => {
  // Drive every source's read over a parsed body, collecting the dispatches.
  function readAll(body: string): UnknownAction[] {
    const { dispatch, actions } = collectingDispatch();
    const params = parseHashParams(body);
    for (const source of HASH_PARAM_SOURCES) {
      source.read({ value: params.get(source.key), isInitial: true, dispatch });
    }
    return actions;
  }

  it('composes and parses focus + t together', () => {
    const body = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      time: manualTime(),
      orientation: 'ecliptic',
      currentHash: '',
    }).desiredHashBody;
    expect(body).toBe(`focus=cluster-virgo-m87&t=${KNOWN_ISO}`);

    const actions = readAll(body);
    expect(actions).toContainEqual(requestFocus('cluster-virgo-m87'));
    expect(actions.map((a) => a.type)).toContain('time/setSimDays');
    expect(actions.map((a) => a.type)).toContain('time/pause');
  });

  it('focus alone: manual clock absent ⇒ no t param, no time dispatch', () => {
    const body = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      time: liveTime(),
      orientation: 'ecliptic',
      currentHash: '',
    }).desiredHashBody;
    expect(body).toBe('focus=cluster-virgo-m87');

    const actions = readAll(body);
    expect(actions).toContainEqual(requestFocus('cluster-virgo-m87'));
    expect(actions.map((a) => a.type)).not.toContain('time/setSimDays');
  });

  it('t alone: no focus ⇒ only the clock is restored', () => {
    const body = computeDesiredHash({
      focused: null,
      time: manualTime(),
      orientation: 'ecliptic',
      currentHash: '',
    }).desiredHashBody;
    expect(body).toBe(`t=${KNOWN_ISO}`);

    const actions = readAll(body);
    // focus is absent on the initial pass, so no selection dispatch fires.
    expect(actions).not.toContainEqual(clearSelection());
    expect(actions.map((a) => a.type)).toEqual(['time/setSimDays', 'time/pause']);
  });
});

// ── The `orientation` (camera frame) param source ───────────────────────────

describe('orientation param source — compose (write)', () => {
  it('writes null at the ecliptic default and the frame id otherwise', () => {
    // A view preference, not a target: the default composes no bytes (bare URL =
    // default frame), and only a non-default frame surfaces on the hash.
    expect(
      orientationSource.write({ focused: null, orientation: 'ecliptic', currentHash: '' }),
    ).toBe(null);
    expect(
      orientationSource.write({ focused: null, orientation: 'galactic', currentHash: '' }),
    ).toBe('galactic');
  });

  it('a non-default frame round-trips through compose/parse', () => {
    const body = computeDesiredHash({
      focused: null,
      orientation: 'galactic',
      currentHash: '',
    }).desiredHashBody;
    expect(body).toBe('orientation=galactic');
    expect(parseHashParams(body).get('orientation')).toBe('galactic');
  });
});

describe('orientation param source — parse (read)', () => {
  it('snaps the frame via setOrientation and dispatches no frameTween', () => {
    // The read SNAPS the committed frame so a share link reproduces the
    // composition with no slerp: exactly one setOrientation dispatch, and no
    // frame-tween action.
    const { dispatch, actions } = collectingDispatch();
    orientationSource.read({ value: 'galactic', isInitial: true, dispatch });
    expect(actions).toEqual([setOrientation('galactic')]);
  });

  it('ignores an absent or junk value (hand-typed hash, bare URL)', () => {
    const { dispatch, actions } = collectingDispatch();
    orientationSource.read({ value: undefined, isInitial: true, dispatch });
    orientationSource.read({ value: '', isInitial: false, dispatch });
    orientationSource.read({ value: 'polaris', isInitial: false, dispatch });
    expect(actions).toHaveLength(0);
  });
});
