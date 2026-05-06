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
 * Form-field guard: typing inside an `<input>`, `<textarea>`, or
 * `contenteditable` element should not hijack `f` and `h`.  The check
 * runs first so the rest of the dispatch sees only "real" keystrokes.
 */

import { useEffect, type RefObject } from 'react';
import type { EngineHandle, PointInfo } from '../@types';

export type UseKeyboardShortcutsInput = {
  /** The currently-pinned galaxy.  `f` is a no-op when null. */
  selected: PointInfo | null;
  /** Used to gate the `/` shortcut so the palette doesn't reopen on top of itself. */
  paletteOpen: boolean;
  /** Engine driver for clearSelection, focusOn, focusOnHome, logCameraState. */
  engineHandleRef: RefObject<EngineHandle | null>;
  /** App-side callback to flip palette state on Cmd+K / `/`. */
  onOpenPalette: () => void;
};

export function useKeyboardShortcuts(input: UseKeyboardShortcutsInput): void {
  const { selected, paletteOpen, engineHandleRef, onOpenPalette } = input;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ── Ignore keystrokes typed into form fields ────────────────
      const target = e.target as Element | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // ── Cmd+K / Ctrl+K opens the palette ────────────────────────
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }
      // ── `/` opens the palette (only if not already open) ────────
      if (e.key === '/' && !paletteOpen) {
        e.preventDefault();
        onOpenPalette();
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
    // engineHandleRef and onOpenPalette are stable references (ref
    // object, useState setter respectively) — listed for the
    // exhaustive-deps lint without triggering re-binds.
  }, [selected, paletteOpen, engineHandleRef, onOpenPalette]);
}
