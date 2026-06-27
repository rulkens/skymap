/**
 * `useKeyboardShortcuts` — global keydown listener for the app's
 * top-level shortcuts:
 *
 *   - Cmd+K / Ctrl+K / `/`  → open the command palette
 *   - Esc                    → clear pinned selection + exit a running tour
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

import { useEffect } from 'react';
import { useAppDispatch } from '../store/hooks';
import { clearSelection, updateSelectionFocus } from '../state/selection/selectionSlice';
import { exitTour } from '../state/tour/tourActions';
import { refOf } from '../services/engine/helpers/refOf';
import type { UseKeyboardShortcutsInput } from '../@types/engine/UseKeyboardShortcutsInput';

export function useKeyboardShortcuts(input: UseKeyboardShortcutsInput): void {
  const {
    selected,
    paletteOpen,
    engineHandleRef,
    setPaletteOpen,
    toggleUiHidden,
    toggleDebugPanelOpen,
  } = input;

  const dispatch = useAppDispatch();

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

      // ── Esc — universal "close / abort" gesture ───────────────
      // Clears both galaxy selection AND structure focus in one
      // dispatch, collapsing whichever card variant is on screen,
      // and exits a running guided tour. A running tour hides the
      // whole HUD (including the dev panel that launched it), so Esc
      // is the only way back out; `exitTour` is a harmless no-op
      // when no tour is active.
      if (e.key === 'Escape') {
        dispatch(clearSelection());
        dispatch(exitTour());
        return;
      }

      // ── f focuses on the currently-pinned target ───────────────
      // Converts the rich display-model target to its identity
      // SelectionRef and dispatches the focus slot write.
      if (e.key === 'f' || e.key === 'F') {
        if (selected) dispatch(updateSelectionFocus(refOf(selected)));
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
        toggleUiHidden();
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
        toggleDebugPanelOpen();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selected,
    paletteOpen,
    dispatch,
    engineHandleRef,
    setPaletteOpen,
    toggleUiHidden,
    toggleDebugPanelOpen,
  ]);
  // dispatch is stable (redux store identity); engineHandleRef (ref object),
  // setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen are stable useCallback
  // wrappers — listed for exhaustive-deps but never trigger re-binds.
}
