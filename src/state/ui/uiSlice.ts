/**
 * uiSlice — app-level UI state as a single Redux Toolkit slice, authored with
 * inline Immer case reducers.
 *
 * This gathers three previously-scattered boolean flags (paletteOpen,
 * uiHidden, debugPanelOpen) plus the splash sub-object into one owned root
 * slice. The alternative — leaving them in component-local React state or
 * spread across ad-hoc Zustand atoms — means keyboard shortcuts and tour
 * effects must hunt for the right setter across unrelated modules. A single
 * slice makes the full UI state addressable from one place and consistent with
 * the Intent-store model (ADR 0007).
 *
 * Toggle reducers (`toggleUiHidden`, `toggleDebugPanelOpen`) exist because the
 * keyboard shortcuts for those flags are pure toggles: the action is "flip",
 * not "set to true" or "set to false". Modelling that as `!state.x` inside the
 * reducer removes React's `SetStateAction` functional-updater contract from
 * the call site and its associated stale-closure trap (a handler capturing an
 * old value of the flag would compute the wrong target). `paletteOpen` has no
 * toggler because the keyboard shortcut only ever opens the palette, never
 * closes it — close is a user gesture on the palette itself.
 *
 * `dismissSplash` is one reducer for both Explore and Tour dismiss paths; it
 * writes both `visible: false` and `dismissedVersion` in a single atomic
 * update so neither field can lag the other. `reopenSplash` only sets
 * `visible: true` and leaves `dismissedVersion` alone: reopening the splash
 * (e.g. via Help) is an informational display, not a first-time-seen event,
 * and resetting the version would cause the dismiss logic to treat a returning
 * user as new.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { UiState } from '../../@types/ui/UiState';
import { buildInitialUiState } from './buildInitialUiState';

const initialState: UiState = buildInitialUiState();

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // ── palette ─────────────────────────────────────────────────────────────
    setPaletteOpen: (state, action: PayloadAction<boolean>) => {
      state.paletteOpen = action.payload;
    },

    // ── ui visibility ────────────────────────────────────────────────────────
    setUiHidden: (state, action: PayloadAction<boolean>) => {
      state.uiHidden = action.payload;
    },
    // Keyboard shortcut is a pure toggle — see module header.
    toggleUiHidden: (state) => {
      state.uiHidden = !state.uiHidden;
    },

    // ── debug panel ──────────────────────────────────────────────────────────
    setDebugPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.debugPanelOpen = action.payload;
    },
    // Keyboard shortcut is a pure toggle — see module header.
    toggleDebugPanelOpen: (state) => {
      state.debugPanelOpen = !state.debugPanelOpen;
    },

    // ── splash ───────────────────────────────────────────────────────────────
    // One reducer for Explore + Tour dismiss; atomically writes both fields.
    dismissSplash: (state, action: PayloadAction<number>) => {
      state.splash.visible = false;
      state.splash.dismissedVersion = action.payload;
    },
    // Reopening is informational — dismissedVersion stays (see module header).
    reopenSplash: (state) => {
      state.splash.visible = true;
    },
  },
});

export const {
  setPaletteOpen,
  setUiHidden,
  toggleUiHidden,
  setDebugPanelOpen,
  toggleDebugPanelOpen,
  dismissSplash,
  reopenSplash,
} = uiSlice.actions;

export default uiSlice.reducer;
