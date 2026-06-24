// @vitest-environment jsdom
/**
 * persistSplashVersion — tests for the localStorage persistence effect.
 *
 * Uses a real store (createAppStore) to confirm end-to-end behaviour:
 * dispatch flows through the reducer, subscriber fires, and the effect
 * either writes storage or correctly refrains from doing so.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import { dismissSplash, reopenSplash } from '../../../src/state/ui/uiSlice';
import { persistSplashVersion } from '../../../src/state/ui/persistSplashVersion';
import { SPLASH_STORAGE_KEY } from '../../../src/state/ui/splashStorage';
import type { UiState } from '../../../src/@types/ui/UiState';

const settings = buildInitialSettings();

beforeEach(() => {
  window.localStorage.clear();
});

describe('persistSplashVersion', () => {
  it('dispatching dismissSplash(2) writes seenVersion to localStorage', () => {
    const { store } = createAppStore({ settings });
    persistSplashVersion(store);

    store.dispatch(dismissSplash(2));

    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBe('2');
  });

  it('reopenSplash does not write seenVersion', () => {
    // Seed with a dismissed state (visible:false, dismissedVersion:2) so that
    // reopenSplash flips visible false→true — a real state change that fires
    // the subscriber — but leaves dismissedVersion at 2. The no-write should
    // be due to the dismissedVersion diff guard, not a no-op dispatch.
    const preloadedUi: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      caption: null,
      splash: { visible: false, dismissedVersion: 2 },
    };
    const { store } = createAppStore({ settings, ui: preloadedUi });
    persistSplashVersion(store);

    // localStorage is clear; confirm the subscriber does not write on reopenSplash.
    store.dispatch(reopenSplash());

    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBeNull();
  });

  it('the returned unsubscribe stops further writes', () => {
    const { store } = createAppStore({ settings });
    const stop = persistSplashVersion(store);

    stop();
    store.dispatch(dismissSplash(3));

    expect(window.localStorage.getItem(SPLASH_STORAGE_KEY)).toBeNull();
  });
});
