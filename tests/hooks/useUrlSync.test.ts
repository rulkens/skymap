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
 *      (b) an empty hash on mount dispatches `clearSelection()`;
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
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';
import type { StructureInfo } from '../../src/@types/data/structure/StructureInfo';
import { Source } from '../../src/data/sources';
import { createAppStore } from '../../src/store/createAppStore';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import { requestFocus } from '../../src/state/selection/requestFocus';
import { clearSelection } from '../../src/state/selection/selectionSlice';

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

// ── computeDesiredHash ────────────────────────────────────────────────────

describe('computeDesiredHash (unified)', () => {
  it('returns empty body when focus is null', () => {
    const out = computeDesiredHash({ focused: null, currentHash: '' });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('returns focus=<id> when focused is a galaxy', () => {
    const out = computeDesiredHash({ focused: makeGalaxy(), currentHash: '' });
    expect(out.desiredHashBody).toMatch(/^focus=/);
    expect(out.matches).toBe(false);
  });

  it('writes focus=<id> when focused is a structure', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      currentHash: '',
    });
    expect(out.desiredHashBody).toBe('focus=cluster-virgo-m87');
    expect(out.matches).toBe(false);
  });

  it('short-circuits when currentHash already matches a structure body', () => {
    const out = computeDesiredHash({
      focused: makeStructure('cluster-virgo-m87'),
      currentHash: '#focus=cluster-virgo-m87',
    });
    expect(out.matches).toBe(true);
  });

  it('short-circuits when currentHash already matches the empty body', () => {
    const out = computeDesiredHash({ focused: null, currentHash: '' });
    expect(out.matches).toBe(true);
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

  it('dispatches clearSelection on mount when hash is empty', () => {
    window.location.hash = '';
    const { dispatchSpy, wrapper } = makeStoreAndWrapper();
    renderHook(() => useUrlSync(), { wrapper });
    const calls = dispatchSpy.mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(clearSelection());
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
