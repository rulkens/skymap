// @vitest-environment jsdom
/**
 * App cinema-mode branch (`?cinema`) — the recorder harness screenshots this
 * page, so cinema mode must render ONLY the canvas plus (while a tour runs)
 * the tour overlay. The HUD chrome must not exist in the DOM at all; the
 * CSS-hide route (`uiStackHidden`) would leave it findable and able to bleed
 * into captures.
 *
 * Mock surface — deliberately minimal, everything else is real:
 *
 *   - `isCinemaMode` is module-mocked because App reads it per render;
 *     flipping `mockReturnValue` is how one file covers both cinema and
 *     normal mode without `vi.resetModules` gymnastics.
 *   - `useEngine` is mocked because jsdom has no WebGPU. The ref pair it
 *     returns is App's whole contract with it, so the mock is two null refs.
 *   - `window.matchMedia` is stubbed (jsdom omits it) for `useIsMobile` —
 *     same technique as InfoCard.mobile.test.tsx.
 *
 * The store is the real `createAppStore`, seeded with a splash-dismissed ui
 * slice so the normal-mode regression test exercises the HUD tree (splash-up
 * would be a different scenario; the splash gate itself is covered in
 * tests/state/ui/buildInitialUiState.test.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { App } from '../../../src/components/App/App';
import { createAppStore } from '../../../src/store/createAppStore';
import { tourStarted } from '../../../src/state/tour/tourSlice';
import { isCinemaMode } from '../../../src/utils/url/isCinemaMode';
import type { UseEngineReturn } from '../../../src/@types/engine/UseEngineReturn';

vi.mock('../../../src/utils/url/isCinemaMode', () => ({
  isCinemaMode: vi.fn<() => boolean>(() => false),
}));

vi.mock('../../../src/hooks/useEngine', () => ({
  useEngine: (): UseEngineReturn => ({
    canvasRef: { current: null },
    handleRef: { current: null },
  }),
}));

// jsdom omits matchMedia; useIsMobile calls it at mount. Desktop (false)
// keeps the normal-mode HUD in its default layout.
function stubMatchMedia(): void {
  window.matchMedia = vi.fn<(query: string) => MediaQueryList>(
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
        removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
        addListener: vi.fn<MediaQueryList['addListener']>(),
        removeListener: vi.fn<MediaQueryList['removeListener']>(),
        dispatchEvent: vi.fn<MediaQueryList['dispatchEvent']>(),
      }) as unknown as MediaQueryList,
  );
}

type Store = ReturnType<typeof createAppStore>['store'];

// Splash pre-dismissed: SplashContainer renders null, so the normal-mode
// test asserts on the HUD proper rather than the splash overlay.
function makeStore(): Store {
  return createAppStore({
    ui: {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: 1 },
    },
  }).store;
}

function renderApp(store: Store): ReturnType<typeof render> {
  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

// Stable DOM hooks for the HUD chrome — aria-labels, not CSS-module class
// fragments (mangled names aren't a contract). querySelector, not role
// queries, because splash/palette transitions toggle aria-hidden and the
// contract under test is DOM existence, not accessibility-tree visibility.
const HUD_SELECTORS: readonly string[] = [
  '[aria-label="Search galaxies and clusters"]', // SearchTrigger
  '[aria-label="About skymap"]', // AboutPill
  '[aria-label="Navigation cheatsheet"]', // NavigationPanel
  '[aria-label="Scale reference"]', // ScaleBar
];

beforeEach(() => {
  stubMatchMedia();
});

describe('App cinema mode', () => {
  it('cinema mode mounts only the canvas (no HUD chrome)', () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const { container } = renderApp(makeStore());

    expect(container.querySelector('canvas#c')).not.toBeNull();
    for (const selector of HUD_SELECTORS) {
      expect(container.querySelector(selector)).toBeNull();
    }
    // StatusBar renders only unhealthy engine states (role alert/status);
    // assert none regardless of state.
    expect(container.querySelector('[role="alert"], [role="status"]')).toBeNull();
    // Blanket guard: with no tour running there is no interactive chrome at
    // all — anything clickable here would end up in the recording.
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('cinema mode mounts TourOverlayContainer while a tour is active', () => {
    vi.mocked(isCinemaMode).mockReturnValue(true);
    const store = makeStore();
    // `webShowcase` is a real registry tour — same seed as the
    // TourOverlayContainer suite.
    store.dispatch(tourStarted({ tourId: 'webShowcase' }));
    const { container } = renderApp(store);

    // The overlay's always-on nav proves the container mounted; the HUD
    // chrome stays absent even with the tour running.
    expect(container.querySelector('[aria-label="Exit tour"]')).not.toBeNull();
    for (const selector of HUD_SELECTORS) {
      expect(container.querySelector(selector)).toBeNull();
    }
  });

  it('normal mode still mounts the HUD', () => {
    vi.mocked(isCinemaMode).mockReturnValue(false);
    const { container } = renderApp(makeStore());

    expect(container.querySelector('canvas#c')).not.toBeNull();
    for (const selector of HUD_SELECTORS) {
      expect(container.querySelector(selector)).not.toBeNull();
    }
  });
});
