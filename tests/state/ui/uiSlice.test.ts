/**
 * uiSlice — unit tests for the inline-Immer RTK ui slice.
 *
 * Toggle actions are exercised twice to confirm they produce the correct flip
 * in both directions. The splash arms are covered end-to-end by useSplash.
 */

import { describe, it, expect } from 'vitest';

import reducer, {
  toggleUiHidden,
  toggleDebugPanelOpen,
  setPaletteTab,
  setPaletteOpen,
} from '../../../src/state/ui/uiSlice';
import { buildInitialUiState } from '../../../src/state/ui/buildInitialUiState';
import type { UiState } from '../../../src/@types/ui/UiState';

const base = (): UiState => ({
  paletteOpen: false,
  uiHidden: false,
  debugPanelOpen: false,
  paletteTab: 'highlights',
  splash: {
    visible: false,
    dismissedVersion: null,
  },
});

describe('uiSlice — ui visibility', () => {
  it('toggleUiHidden flips uiHidden false→true→false', () => {
    const after1 = reducer(base(), toggleUiHidden());
    expect(after1.uiHidden).toBe(true);

    const after2 = reducer(after1, toggleUiHidden());
    expect(after2.uiHidden).toBe(false);
  });
});

describe('uiSlice — debug panel', () => {
  it('toggleDebugPanelOpen flips debugPanelOpen false→true→false', () => {
    const after1 = reducer(base(), toggleDebugPanelOpen());
    expect(after1.debugPanelOpen).toBe(true);

    const after2 = reducer(after1, toggleDebugPanelOpen());
    expect(after2.debugPanelOpen).toBe(false);
  });
});

describe('uiSlice — palette tab', () => {
  it('paletteTab survives closing and reopening the palette', () => {
    let state = reducer(base(), setPaletteTab('missions'));
    state = reducer(state, setPaletteOpen(false));
    state = reducer(state, setPaletteOpen(true));
    expect(state.paletteTab).toBe('missions');
  });

  it('a fresh store starts on highlights', () => {
    expect(buildInitialUiState().paletteTab).toBe('highlights');
  });
});
