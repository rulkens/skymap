import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { EngineHandle } from './EngineHandle';
import type { PointInfo } from './PointInfo';

export type UseKeyboardShortcutsInput = {
  /** The currently-pinned galaxy.  `f` is a no-op when null. */
  selected: PointInfo | null;
  /** Used to gate the `/` shortcut so the palette doesn't reopen on top of itself. */
  paletteOpen: boolean;
  /** Engine driver for selection.clear, camera.focusOn, camera.focusOnHome, camera.logState. */
  engineHandleRef: RefObject<EngineHandle | null>;
  /**
   * The React setter for the palette-open state.  Taking the setter
   * directly (instead of an `() => void` callback) is the only honest
   * way to keep the effect's dep list stable: React's `setState`
   * functions are guaranteed-stable references for the component
   * lifetime, so the listener re-binds only when `selected` or
   * `paletteOpen` actually change.  An arrow `() => setPaletteOpen(true)`
   * passed from the call site would be a fresh identity each render
   * and force a re-bind on every parent render.
   */
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  /**
   * The React setter for the "hide UI" mode (`Tab` shortcut).  Same
   * stable-reference rationale as `setPaletteOpen` — passed in directly
   * so the effect's dep list stays stable.  Toggled with the functional
   * form (`prev => !prev`) inside the handler so we don't need to read
   * the current state.
   */
  setUiHidden: Dispatch<SetStateAction<boolean>>;
  /**
   * The React setter for the asset-loading dev panel's visibility (`d`
   * shortcut).  Same stable-reference rationale as the others — the
   * dev panel defaults to hidden and `d` toggles it.
   */
  setLoadingDevPanelOpen: Dispatch<SetStateAction<boolean>>;
};
