/**
 * `useKeyboardShortcuts` — global keydown listener for the app's
 * top-level shortcuts:
 *
 *   - Cmd+K / Ctrl+K / `/`  → open the command palette
 *   - Esc                    → clear pinned selection
 *   - f / F                  → focus on the currently-pinned galaxy
 *   - h / H                  → return camera to home view
 *   - Tab                    → toggle "hide UI" mode (clean visual)
 *   - l                      → debug: log live camera state
 *   - d / D                  → toggle the asset-loading dev panel
 *
 * Why a hook?  The handler closes over `selected` and `paletteOpen`,
 * so we need a re-bind whenever those change.  Wrapping it in a hook
 * keeps the closure-management discipline (declarative deps array)
 * out of App.tsx and lets us evolve the shortcut set without touching
 * the wiring layer.
 *
 * Form-field guard: typing inside an `<input>`, `<textarea>`,
 * `<select>`, or `contenteditable` element should not hijack `f` and
 * `h`.  The check runs first so the rest of the dispatch sees only
 * "real" keystrokes.  `<select>` is included because letter keys jump
 * to options on most platforms; without the guard, hitting `h` while
 * the BiasMode select is focused would yank the camera home.
 */

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { EngineHandle, PointInfo } from '../@types';

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

export function useKeyboardShortcuts(input: UseKeyboardShortcutsInput): void {
  const {
    selected,
    paletteOpen,
    engineHandleRef,
    setPaletteOpen,
    setUiHidden,
    setLoadingDevPanelOpen,
  } = input;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ── Ignore keystrokes typed into form fields ────────────────
      const target = e.target as Element | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // ── Cmd+K / Ctrl+K opens the palette ────────────────────────
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      // ── `/` opens the palette (only if not already open) ────────
      if (e.key === '/' && !paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // ── Esc clears the pin ─────────────────────────────────────
      if (e.key === 'Escape') {
        engineHandleRef.current?.selection.clear();
        return;
      }

      // ── f focuses on the currently-pinned galaxy ───────────────
      if (e.key === 'f' || e.key === 'F') {
        if (selected) engineHandleRef.current?.camera.focusOn(selected);
        return;
      }

      // ── h returns to the home / Earth view ─────────────────────
      if (e.key === 'h' || e.key === 'H') {
        engineHandleRef.current?.camera.focusOnHome();
        return;
      }

      // ── Tab toggles "hide UI" mode ─────────────────────────────
      // Clean-visual mode for screenshots / recordings.  The form-
      // field guard above already excludes input/textarea/select/
      // contentEditable, so `Tab` still focus-traverses inside form
      // controls (e.g. the BiasMode select); only "loose" Tab presses
      // outside form fields hijack to toggle the UI.  `preventDefault`
      // stops the browser's default focus-traversal in the un-guarded
      // case — otherwise the next focusable button would steal focus
      // and the user would have a hidden UI plus a stray focus ring.
      if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setUiHidden((prev) => !prev);
        return;
      }

      // ── l prints the live camera state (dev hotkey) ────────────
      // Lower-case only — capital L is reserved for future use.
      if (e.key === 'l') {
        engineHandleRef.current?.camera.logState();
        return;
      }

      // ── d toggles the asset-loading dev panel ──────────────────
      // Hidden by default; press `d` to surface it, press again to
      // tuck it away.  Bare key (no modifier) so it doesn't collide
      // with browser dev-tool shortcuts (Cmd+Opt+D etc.).
      if (e.key === 'd' || e.key === 'D') {
        setLoadingDevPanelOpen((prev) => !prev);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selected,
    paletteOpen,
    engineHandleRef,
    setPaletteOpen,
    setUiHidden,
    setLoadingDevPanelOpen,
  ]);
  // engineHandleRef (ref object), setPaletteOpen and setUiHidden (React setters)
  // are stable references — listed for exhaustive-deps; never trigger re-binds.
}
