// @vitest-environment jsdom
/**
 * useSplash — hook integration tests.
 *
 * Every renderHook call wraps in a Redux Provider so that `useAppSelector` and
 * `useAppDispatch` find the store.  The wrapper is built with `createElement`
 * (not JSX) so this stays a `.ts` file — matches the hooks.test.ts convention.
 *
 * `status` and `loadProgress` are read from the engine Redux slice rather than
 * passed as arguments, so these tests seed the engine slice via
 * `engineStatusChanged` / `engineLoadProgressChanged` before or during the
 * render.
 *
 * Visibility init (first-visit / deep-link / seenVersion gates) is covered by
 * `buildInitialUiState.test.ts`.  These tests assert that `splashVisible`
 * follows the store and that dismiss/reopen dispatch the correct actions.
 * The 8 s timer, blocked state, and error mapping are unchanged logic tested
 * here end-to-end with appropriate store seeds.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useSplash } from '../../src/hooks/useSplash';
import { createAppStore } from '../../src/store/createAppStore';
import { buildInitialUiState } from '../../src/state/ui/buildInitialUiState';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import { dismissSplash, reopenSplash } from '../../src/state/ui/uiSlice';
import { engineStatusChanged, engineLoadProgressChanged } from '../../src/state/engine/engineSlice';
import { selectSplashVisible, selectSplashDismissedVersion } from '../../src/state/ui/selectors';
import { CURRENT_SPLASH_VERSION } from '../../src/state/ui/splashStorage';
import type { UiState } from '../../src/@types/ui/UiState';
import { Source } from '../../src/data/sources';

/**
 * Render useSplash inside a Provider-wrapped store.  The `ui` seed is
 * optional; when omitted, `buildInitialUiState()` is used (reads localStorage +
 * window.location just like real boot).  Pass an explicit `ui` to set up a
 * known slice state without touching the browser environment.
 */
function renderSplash(ui?: UiState) {
  const { store } = createAppStore({
    settings: buildInitialSettings(),
    ui: ui ?? buildInitialUiState(),
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  return { store, ...renderHook(() => useSplash(), { wrapper }) };
}

describe('useSplash — slice-backed visibility', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('splashVisible is true when the store seeds splash visible', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { result } = renderSplash(ui);
    expect(result.current.splashVisible).toBe(true);
  });

  it('splashVisible is false when the store seeds splash hidden', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: CURRENT_SPLASH_VERSION },
    };
    const { result } = renderSplash(ui);
    expect(result.current.splashVisible).toBe(false);
  });

  it('splashVisible follows store dispatches (dismiss → reopen cycle)', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store, result } = renderSplash(ui);

    expect(result.current.splashVisible).toBe(true);

    act(() => {
      store.dispatch(dismissSplash(CURRENT_SPLASH_VERSION));
    });
    expect(result.current.splashVisible).toBe(false);

    act(() => {
      store.dispatch(reopenSplash());
    });
    expect(result.current.splashVisible).toBe(true);
  });
});

describe('useSplash — dispatch on dismiss + reopen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('dismissExplore dispatches dismissSplash — sets visible:false and records version', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store, result } = renderSplash(ui);

    act(() => {
      result.current.dismissExplore();
    });

    expect(selectSplashVisible(store.getState())).toBe(false);
    expect(selectSplashDismissedVersion(store.getState())).toBe(CURRENT_SPLASH_VERSION);
  });

  it('dismissTour dispatches dismissSplash — sets visible:false and records version', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store, result } = renderSplash(ui);

    act(() => {
      result.current.dismissTour();
    });

    expect(selectSplashVisible(store.getState())).toBe(false);
    expect(selectSplashDismissedVersion(store.getState())).toBe(CURRENT_SPLASH_VERSION);
  });

  it('reopen dispatches reopenSplash — sets visible:true, dismissedVersion unchanged', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: CURRENT_SPLASH_VERSION },
    };
    const { store, result } = renderSplash(ui);

    act(() => {
      result.current.reopen();
    });

    expect(selectSplashVisible(store.getState())).toBe(true);
    expect(selectSplashDismissedVersion(store.getState())).toBe(CURRENT_SPLASH_VERSION);
  });
});

describe('useSplash — blocked state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('flips blocked=false when the engine reports ready with no loadProgress', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: buildInitialSettings(), ui });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });

    // Start with the default engine state (initializing, no loadProgress).
    // Hook reads status + loadProgress from the store.
    const { result } = renderHook(() => useSplash(), { wrapper });
    expect(result.current.blocked).toBe(true);

    // Both gate conditions now live in the store, so driving it is the whole
    // trigger — no input prop participates in readiness.
    act(() => {
      store.dispatch(engineStatusChanged({ kind: 'ready', count: 100, source: Source.SDSS }));
      store.dispatch(engineLoadProgressChanged(null));
    });

    expect(result.current.blocked).toBe(false);
  });

  it('stays blocked while loadProgress is non-null even after status=ready', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: buildInitialSettings(), ui });
    // Seed the engine slice: status=ready, loadProgress in-flight.
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 100, source: Source.SDSS }));
    store.dispatch(engineLoadProgressChanged({ loadedBytes: 1, totalBytes: 2, inFlightCount: 1 }));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });

    const { result } = renderHook(() => useSplash(), { wrapper });
    expect(result.current.blocked).toBe(true);
  });
});

describe('useSplash — 8 s "Continue anyway" timer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('canContinueAnyway flips true after 8 s of being blocked', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    // Default engine state is `initializing` → hook reads blocked=true.
    const { result } = renderSplash(ui);
    expect(result.current.canContinueAnyway).toBe(false);
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(result.current.canContinueAnyway).toBe(true);
  });

  it('does not start the 8 s timer when splash is not visible (deep-link path)', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: null },
    };
    const { result } = renderSplash(ui);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.canContinueAnyway).toBe(false);
  });
});

describe('useSplash error mapping', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  const visibleUi: UiState = {
    paletteOpen: false,
    uiHidden: false,
    debugPanelOpen: false,
    splash: { visible: true, dismissedVersion: null },
  };

  /** Helper: render useSplash with an explicit engine `status` seeded in the store. */
  function renderWithStatus(statusPayload: Parameters<typeof engineStatusChanged>[0]) {
    const { store } = createAppStore({ settings: buildInitialSettings(), ui: visibleUi });
    store.dispatch(engineStatusChanged(statusPayload));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    return renderHook(() => useSplash(), { wrapper });
  }

  it('returns error.kind=webgpu-init-failed when status.kind=error with a webgpu message', () => {
    const { result } = renderWithStatus({
      kind: 'error',
      message: 'WebGPU: requestAdapter returned null',
    });
    expect(result.current.error).toEqual({
      kind: 'webgpu-init-failed',
      message: 'WebGPU: requestAdapter returned null',
    });
  });

  it('returns error.kind=data-version-mismatch when the engine reports cause=format-version', () => {
    const { result } = renderWithStatus({
      kind: 'error',
      message: 'unsupported version: 8 — please regenerate the .bin via "npm run build-tiers"',
      cause: 'format-version',
    });
    expect(result.current.error).toEqual({
      kind: 'data-version-mismatch',
      message: 'unsupported version: 8 — please regenerate the .bin via "npm run build-tiers"',
    });
  });

  it('returns error.kind=catalog-fetch-failed for non-webgpu engine errors', () => {
    const { result } = renderWithStatus({
      kind: 'error',
      message: 'Failed to fetch sdss.bin',
    });
    expect(result.current.error).toEqual({
      kind: 'catalog-fetch-failed',
      message: 'Failed to fetch sdss.bin',
    });
  });

  it('returns null on the happy path', () => {
    const { store } = createAppStore({ settings: buildInitialSettings(), ui: visibleUi });
    store.dispatch(engineStatusChanged({ kind: 'ready', count: 100, source: Source.SDSS }));
    store.dispatch(engineLoadProgressChanged(null));
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    const { result } = renderHook(() => useSplash(), { wrapper });
    expect(result.current.error).toBeNull();
  });
});
