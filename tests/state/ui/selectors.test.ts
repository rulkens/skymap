import { describe, it, expect } from 'vitest';

import { createAppStore } from '../../../src/store/createAppStore';
import { buildInitialSettings } from '../../../src/state/settings/initialState';
import type { UiState } from '../../../src/@types/ui/UiState';
import {
  selectPaletteOpen,
  selectUiHidden,
  selectDebugPanelOpen,
  selectSplashVisible,
  selectSplashDismissedVersion,
} from '../../../src/state/ui/selectors';

const baseSettings = buildInitialSettings();

describe('ui selectors', () => {
  it('selectPaletteOpen returns ui.paletteOpen', () => {
    const ui: UiState = {
      paletteOpen: true,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectPaletteOpen(store.getState())).toBe(true);
  });

  it('selectUiHidden returns ui.uiHidden', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: true,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectUiHidden(store.getState())).toBe(true);
  });

  it('selectDebugPanelOpen returns ui.debugPanelOpen', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: true,
      splash: { visible: false, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectDebugPanelOpen(store.getState())).toBe(true);
  });

  it('selectSplashVisible returns ui.splash.visible', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectSplashVisible(store.getState())).toBe(true);
  });

  it('selectSplashDismissedVersion returns ui.splash.dismissedVersion when set', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: false, dismissedVersion: 4 },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectSplashDismissedVersion(store.getState())).toBe(4);
  });

  it('selectSplashDismissedVersion returns null when dismissedVersion is null', () => {
    const ui: UiState = {
      paletteOpen: false,
      uiHidden: false,
      debugPanelOpen: false,
      splash: { visible: true, dismissedVersion: null },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    expect(selectSplashDismissedVersion(store.getState())).toBeNull();
  });

  it('all selectors read from the same seeded store', () => {
    // Smoke-check: a fully populated ui state surfaces correctly through every
    // selector from a single store instance.
    const ui: UiState = {
      paletteOpen: true,
      uiHidden: true,
      debugPanelOpen: true,
      splash: { visible: true, dismissedVersion: 7 },
    };
    const { store } = createAppStore({ settings: baseSettings, ui });
    const state = store.getState();
    expect(selectPaletteOpen(state)).toBe(true);
    expect(selectUiHidden(state)).toBe(true);
    expect(selectDebugPanelOpen(state)).toBe(true);
    expect(selectSplashVisible(state)).toBe(true);
    expect(selectSplashDismissedVersion(state)).toBe(7);
  });
});
