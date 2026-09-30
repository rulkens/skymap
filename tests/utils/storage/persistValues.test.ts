// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';
import { dismissSplash, reopenSplash, toggleUiHidden } from '../../../src/state/ui/uiSlice';
import { persistValues } from '../../../src/utils/storage/persistValues';
import { SPLASH_SEEN_VERSION } from '../../../src/state/persistedValues';
import type { UiState } from '../../../src/@types/ui/UiState';

const settings = INITIAL_SETTINGS;
const dismissedUi: UiState = {
  paletteOpen: false,
  uiHidden: false,
  debugPanelOpen: false,
  paletteTab: 'highlights',
  splash: { visible: false, dismissedVersion: 2 },
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('persistValues', () => {
  it('writes only on change and not at install', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { store } = createAppStore({ settings, ui: dismissedUi });
    persistValues(store, [SPLASH_SEEN_VERSION]);

    store.dispatch(toggleUiHidden());
    expect(setItem).not.toHaveBeenCalled();

    store.dispatch(dismissSplash(3));
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(SPLASH_SEEN_VERSION.key)).toBe('3');
  });

  it('swallows a throwing setItem', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { store } = createAppStore({ settings });
    persistValues(store, [SPLASH_SEEN_VERSION]);

    expect(() => store.dispatch(dismissSplash(2))).not.toThrow();
  });

  it('the returned unsubscribe stops further writes', () => {
    const { store } = createAppStore({ settings });
    const stop = persistValues(store, [SPLASH_SEEN_VERSION]);

    stop();
    store.dispatch(dismissSplash(3));

    expect(window.localStorage.getItem(SPLASH_SEEN_VERSION.key)).toBeNull();
  });
});

describe('SPLASH_SEEN_VERSION row', () => {
  it('reopenSplash does not write (dismissedVersion unchanged)', () => {
    const { store } = createAppStore({ settings, ui: dismissedUi });
    persistValues(store, [SPLASH_SEEN_VERSION]);

    store.dispatch(reopenSplash());

    expect(window.localStorage.getItem(SPLASH_SEEN_VERSION.key)).toBeNull();
  });
});
