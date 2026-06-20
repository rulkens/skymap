import type { RefObject } from 'react';
import type { EngineHandle } from './EngineHandle';
import type { FocusableTarget } from './FocusableTarget';

export type UseKeyboardShortcutsInput = {
  /** The currently-pinned target (galaxy or structure).  `f` is a no-op when null. */
  selected: FocusableTarget | null;
  /** Used to gate the `/` shortcut so the palette doesn't reopen on top of itself. */
  paletteOpen: boolean;
  /** Engine driver for camera.focusOnHome and camera.logState. */
  engineHandleRef: RefObject<EngineHandle | null>;
  /**
   * Stable `useCallback(() => dispatch(setPaletteOpen(open)), [dispatch])` from App.
   * The keyboard shortcut only ever opens the palette (not closes), so this takes
   * an explicit boolean rather than a toggler. Passing it in as a stable ref keeps
   * the effect's dep array stable — the arrow identity doesn't change between renders.
   */
  setPaletteOpen: (open: boolean) => void;
  /**
   * Stable `useCallback(() => dispatch(toggleUiHidden()), [dispatch])` from App.
   * The `Tab` shortcut is a pure toggle: the reducer computes `!state.uiHidden`,
   * removing React's `SetStateAction` functional-updater and its stale-closure trap
   * (a handler capturing an old value would compute the wrong target).
   */
  toggleUiHidden: () => void;
  /**
   * Stable `useCallback(() => dispatch(toggleDebugPanelOpen()), [dispatch])` from App.
   * Same pure-toggle rationale as `toggleUiHidden`.
   */
  toggleDebugPanelOpen: () => void;
};
