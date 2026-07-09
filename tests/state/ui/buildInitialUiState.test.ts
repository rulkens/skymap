// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildInitialUiState } from '../../../src/state/ui/buildInitialUiState';
import { SPLASH_STORAGE_KEY, CURRENT_SPLASH_VERSION } from '../../../src/state/ui/splashStorage';

describe('buildInitialUiState', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  describe('splash.visible', () => {
    it('is true on a first visit (no seenVersion, no deep link)', () => {
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(true);
    });

    it('is false when seenVersion equals the current version', () => {
      window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(false);
    });

    it('is true when seenVersion is lower than the current version', () => {
      window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION - 1));
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(true);
    });

    it('is false when a #focus= deep link is present (regardless of seen state)', () => {
      // No seenVersion — would normally show splash; deep link overrides.
      window.history.replaceState(null, '', '/#focus=ngc224');
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(false);
    });

    it('is false when a ?tour= deep link is present', () => {
      window.history.replaceState(null, '', '/?tour=intro');
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(false);
    });

    it('is false in cinema mode (?cinema) even on a first visit', () => {
      // No seenVersion and no deep link — would normally show the splash.
      // Cinema is gate 0: the recorder must find the page capture-ready
      // with zero interaction.
      window.history.replaceState(null, '', '/?cinema');
      const state = buildInitialUiState();
      expect(state.splash.visible).toBe(false);
    });
  });

  describe('splash.dismissedVersion', () => {
    it('seeds to null when no seenVersion is stored', () => {
      const state = buildInitialUiState();
      expect(state.splash.dismissedVersion).toBeNull();
    });

    it('seeds to the stored seenVersion when present', () => {
      window.localStorage.setItem(SPLASH_STORAGE_KEY, String(CURRENT_SPLASH_VERSION));
      const state = buildInitialUiState();
      expect(state.splash.dismissedVersion).toBe(CURRENT_SPLASH_VERSION);
    });
  });

  describe('default boolean flags', () => {
    it('paletteOpen defaults to false', () => {
      expect(buildInitialUiState().paletteOpen).toBe(false);
    });

    it('uiHidden defaults to false', () => {
      expect(buildInitialUiState().uiHidden).toBe(false);
    });

    it('debugPanelOpen defaults to false', () => {
      expect(buildInitialUiState().debugPanelOpen).toBe(false);
    });
  });
});
