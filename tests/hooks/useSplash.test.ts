// @vitest-environment jsdom
/**
 * useSplash — hook integration tests.
 *
 * Every renderHook call wraps in a Redux Provider so that `useAppSelector` and
 * `useAppDispatch` find the store.  The wrapper is built with `createElement`
 * (not JSX) so this stays a `.ts` file — matches the hooks.test.ts convention.
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
import { selectSplashVisible, selectSplashDismissedVersion } from '../../src/state/ui/selectors';
import { CURRENT_SPLASH_VERSION } from '../../src/state/ui/splashStorage';
import type { UseSplashInput } from '../../src/@types/splash/UseSplashInput';
import type { UiState } from '../../src/@types/ui/UiState';
import { Source } from '../../src/data/sources';

function makeInput(overrides: Partial<UseSplashInput> = {}): UseSplashInput {
  return {
    status: { kind: 'initializing' },
    loadProgress: null,
    famousMetaReady: false,
    ...overrides,
  };
}

/**
 * Render useSplash inside a Provider-wrapped store.  The `ui` seed is
 * optional; when omitted, `buildInitialUiState()` is used (reads localStorage +
 * window.location just like real boot).  Pass an explicit `ui` to set up a
 * known slice state without touching the browser environment.
 */
function renderSplash(input: UseSplashInput, ui?: UiState) {
  const { store } = createAppStore({
    settings: buildInitialSettings(),
    ui: ui ?? buildInitialUiState(),
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(Provider, { store, children });
  return { store, ...renderHook(() => useSplash(input), { wrapper }) };
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
    const { result } = renderSplash(makeInput(), ui);
    expect(result.current.splashVisible).toBe(true);
  });

  it('splashVisible is false when the store seeds splash hidden', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: CURRENT_SPLASH_VERSION },
    };
    const { result } = renderSplash(makeInput(), ui);
    expect(result.current.splashVisible).toBe(false);
  });

  it('splashVisible follows store dispatches (dismiss → reopen cycle)', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store, result } = renderSplash(makeInput(), ui);

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
    const { store, result } = renderSplash(makeInput(), ui);

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
    const { store, result } = renderSplash(makeInput(), ui);

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
    const { store, result } = renderSplash(makeInput(), ui);

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

  it('flips blocked=false when engine ready + famousMetaReady + no loadProgress', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: buildInitialSettings(), ui });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });

    const { result, rerender } = renderHook(
      ({ input }: { input: UseSplashInput }) => useSplash(input),
      { wrapper, initialProps: { input: makeInput() } },
    );
    expect(result.current.blocked).toBe(true);

    rerender({
      input: makeInput({
        status: { kind: 'ready', count: 100, source: Source.SDSS },
        loadProgress: null,
        famousMetaReady: true,
      }),
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
    const { result } = renderSplash(
      makeInput({
        status: { kind: 'ready', count: 100, source: Source.SDSS },
        loadProgress: { loadedBytes: 1, totalBytes: 2, inFlightCount: 1 },
        famousMetaReady: true,
      }),
      ui,
    );
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
    const { result } = renderSplash(makeInput(), ui);
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
    const { result } = renderSplash(makeInput(), ui);
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

  it('returns error.kind=webgpu-init-failed when status.kind=error with a webgpu message', () => {
    const { result } = renderSplash(
      makeInput({ status: { kind: 'error', message: 'WebGPU: requestAdapter returned null' } }),
      visibleUi,
    );
    expect(result.current.error).toEqual({
      kind: 'webgpu-init-failed',
      message: 'WebGPU: requestAdapter returned null',
    });
  });

  it('returns error.kind=catalog-fetch-failed for non-webgpu engine errors', () => {
    const { result } = renderSplash(
      makeInput({ status: { kind: 'error', message: 'Failed to fetch sdss.bin' } }),
      visibleUi,
    );
    expect(result.current.error).toEqual({
      kind: 'catalog-fetch-failed',
      message: 'Failed to fetch sdss.bin',
    });
  });

  it('returns error.kind=famous-meta-failed when famousMetaFailed=true and no engine error', () => {
    const { result } = renderSplash(
      makeInput({
        status: { kind: 'ready', count: 100, source: Source.SDSS },
        loadProgress: null,
        famousMetaReady: true,
        famousMetaFailed: true,
      }),
      visibleUi,
    );
    expect(result.current.error).toEqual({ kind: 'famous-meta-failed' });
  });

  it('prefers engine error over famous-meta-failed (engine error blocks the whole app)', () => {
    const { result } = renderSplash(
      makeInput({
        status: { kind: 'error', message: 'Failed to fetch sdss.bin' },
        famousMetaFailed: true,
      }),
      visibleUi,
    );
    expect(result.current.error?.kind).toBe('catalog-fetch-failed');
  });

  it('returns null on the happy path', () => {
    const { result } = renderSplash(
      makeInput({
        status: { kind: 'ready', count: 100, source: Source.SDSS },
        loadProgress: null,
        famousMetaReady: true,
      }),
      visibleUi,
    );
    expect(result.current.error).toBeNull();
  });
});
