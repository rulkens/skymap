// @vitest-environment jsdom
/**
 * The antique look's chrome switch: turning the look on stamps `data-look`, injects
 * the generated image tokens and mounts the thumbnail engraving filter that
 * styles/antique.css names; turning it off takes all three away, so no stale
 * token or filter can leak into the plain look. Mocks as in App.cinema.test.tsx.
 */

import { readFileSync } from 'node:fs';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/components/App/App';
import { createAppStore } from '../../../src/store/createAppStore';
import { setAntiqueEnabled } from '../../../src/state/settings/core/antiqueSlice';
import type { UseEngineReturn } from '../../../src/@types/engine/UseEngineReturn';

vi.mock('../../../src/hooks/useEngine', () => ({
  useEngine: (): UseEngineReturn => ({ canvasRef: { current: null }, handleRef: { current: null } }),
}));

beforeEach(() => {
  window.matchMedia = vi.fn<(query: string) => MediaQueryList>(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
        removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
        addListener: vi.fn<MediaQueryList['addListener']>(),
        removeListener: vi.fn<MediaQueryList['removeListener']>(),
      }) as unknown as MediaQueryList,
  );
});

const chromeStyle = (): HTMLStyleElement | undefined =>
  [...document.head.querySelectorAll('style')].find((s) => s.textContent?.includes('--frame-image'));

describe('App antique look', () => {
  it('injects the chrome tokens and the engraving filter while the look is on, and removes them after', () => {
    const { store } = createAppStore({
      ui: {
        paletteOpen: false,
        uiHidden: false,
        debugPanelOpen: false,
        paletteTab: 'highlights',
        splash: { visible: false, dismissedVersion: 1 },
      },
    });
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    const filterId = /url\(#([\w-]+)\)/.exec(readFileSync('src/styles/antique.css', 'utf8'))![1]!;
    expect(chromeStyle()).toBeUndefined();

    act(() => {
      store.dispatch(setAntiqueEnabled(true));
    });
    expect(document.documentElement.dataset.look).toBe('antique');
    expect(chromeStyle()!.textContent).toMatch(/^:root\[data-look='antique'\]\{/);
    expect(document.getElementById(filterId)?.tagName.toLowerCase()).toBe('filter');

    act(() => {
      store.dispatch(setAntiqueEnabled(false));
    });
    expect(document.documentElement.dataset.look).toBeUndefined();
    expect(chromeStyle()).toBeUndefined();
    expect(document.getElementById(filterId)).toBeNull();
  });
});
