/**
 * uiSlice — unit tests for the inline-Immer RTK ui slice.
 *
 * Each test calls the slice reducer directly with an action creator's output
 * (`reducer(state, actionCreator(payload))`) and asserts the single field the
 * reducer writes. Toggle actions are exercised twice to confirm they produce
 * the correct flip in both directions.
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  setPaletteOpen,
  setUiHidden,
  toggleUiHidden,
  setDebugPanelOpen,
  toggleDebugPanelOpen,
  dismissSplash,
  reopenSplash,
} from '../../../src/state/ui/uiSlice';
import type { UiState } from '../../../src/@types/ui/UiState';

const base = (): UiState => ({
  paletteOpen: false,
  uiHidden: false,
  debugPanelOpen: false,
  splash: {
    visible: false,
    dismissedVersion: null,
  },
});

describe('uiSlice — palette', () => {
  it('setPaletteOpen(true) writes paletteOpen', () => {
    expect(reducer(base(), setPaletteOpen(true)).paletteOpen).toBe(true);
  });
});

describe('uiSlice — ui visibility', () => {
  it('setUiHidden(true) writes uiHidden', () => {
    expect(reducer(base(), setUiHidden(true)).uiHidden).toBe(true);
  });

  it('toggleUiHidden flips uiHidden false→true→false', () => {
    const after1 = reducer(base(), toggleUiHidden());
    expect(after1.uiHidden).toBe(true);

    const after2 = reducer(after1, toggleUiHidden());
    expect(after2.uiHidden).toBe(false);
  });
});

describe('uiSlice — debug panel', () => {
  it('setDebugPanelOpen(true) writes debugPanelOpen', () => {
    expect(reducer(base(), setDebugPanelOpen(true)).debugPanelOpen).toBe(true);
  });

  it('toggleDebugPanelOpen flips debugPanelOpen false→true→false', () => {
    const after1 = reducer(base(), toggleDebugPanelOpen());
    expect(after1.debugPanelOpen).toBe(true);

    const after2 = reducer(after1, toggleDebugPanelOpen());
    expect(after2.debugPanelOpen).toBe(false);
  });
});

describe('uiSlice — splash', () => {
  it('dismissSplash(2) sets splash.visible false and dismissedVersion 2', () => {
    const state: UiState = { ...base(), splash: { visible: true, dismissedVersion: null } };
    const next = reducer(state, dismissSplash(2));
    expect(next.splash.visible).toBe(false);
    expect(next.splash.dismissedVersion).toBe(2);
  });

  it('reopenSplash sets splash.visible true and leaves dismissedVersion unchanged', () => {
    // Seed a dismissed state with a known version.
    const dismissed: UiState = {
      ...base(),
      splash: { visible: false, dismissedVersion: 2 },
    };
    const next = reducer(dismissed, reopenSplash());
    expect(next.splash.visible).toBe(true);
    expect(next.splash.dismissedVersion).toBe(2);
  });
});
