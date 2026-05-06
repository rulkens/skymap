/**
 * `useKeyboardShortcuts` — global keydown listener for the app's
 * top-level shortcuts:
 *
 *   - Cmd+K / Ctrl+K / `/`  → open the command palette
 *   - Esc                    → clear pinned selection
 *   - f / F                  → focus on the currently-pinned galaxy
 *   - h / H                  → return camera to home view
 *   - l                      → debug: log live camera state
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
  /** Engine driver for clearSelection, focusOn, focusOnHome, logCameraState. */
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
};

export function useKeyboardShortcuts(input: UseKeyboardShortcutsInput): void {
  const { selected, paletteOpen, engineHandleRef, setPaletteOpen } = input;

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
        engineHandleRef.current?.clearSelection();
        return;
      }

      // ── f focuses on the currently-pinned galaxy ───────────────
      if (e.key === 'f' || e.key === 'F') {
        if (selected) engineHandleRef.current?.focusOn(selected);
        return;
      }

      // ── h returns to the home / Earth view ─────────────────────
      if (e.key === 'h' || e.key === 'H') {
        engineHandleRef.current?.focusOnHome();
        return;
      }

      // ── l prints the live camera state (dev hotkey) ────────────
      // Lower-case only — capital L is reserved for future use.
      if (e.key === 'l') {
        engineHandleRef.current?.logCameraState();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, paletteOpen, engineHandleRef, setPaletteOpen]);
  // engineHandleRef (ref object) and setPaletteOpen (React setter) are
  // both stable references — listed for exhaustive-deps; never trigger re-binds.
}
