// @vitest-environment jsdom
/**
 * Integration tests for `useKeyboardShortcuts`.
 *
 * The hook attaches a `window` keydown listener; tests dispatch real
 * `KeyboardEvent`s and assert against a real Redux store built via
 * `createAppStore`. This proves the reducer toggle is correct end-to-end
 * (no stale-closure trap: the callback dispatches a toggle action, not a
 * value derived from captured React state).
 *
 * The engine handle ref is always `{ current: null }` here — tests that
 * exercise camera/selection actions would need a mock engine; these tests
 * focus on the UI-slice side effects that don't touch the handle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { createAppStore } from '../../src/store/createAppStore';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import {
  selectUiHidden,
  selectDebugPanelOpen,
  selectPaletteOpen,
} from '../../src/state/ui/selectors';
import { setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen } from '../../src/state/ui/uiSlice';

/** Fire a keydown on window with the given init options. */
function fireKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

/** Build the minimal hook input that wires everything through a real store. */
function makeInput(store: ReturnType<typeof createAppStore>) {
  return {
    selected: null,
    paletteOpen: false,
    engineHandleRef: { current: null },
    setPaletteOpen: (open: boolean) => store.dispatch(setPaletteOpen(open)),
    toggleUiHidden: () => store.dispatch(toggleUiHidden()),
    toggleDebugPanelOpen: () => store.dispatch(toggleDebugPanelOpen()),
  };
}

describe('useKeyboardShortcuts — integration (real store)', () => {
  let store: ReturnType<typeof createAppStore>;

  beforeEach(() => {
    store = createAppStore({ settings: buildInitialSettings({ initialTier: 'medium' }) });
  });

  it('Tab toggles uiHidden false → true → false (proves toggle, no stale closure)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    expect(selectUiHidden(store.getState())).toBe(false);

    act(() => fireKey({ key: 'Tab' }));
    expect(selectUiHidden(store.getState())).toBe(true);

    act(() => fireKey({ key: 'Tab' }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('Tab fires e.preventDefault() (cancelable event is cancelled)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    act(() => window.dispatchEvent(event));
    expect(preventSpy).toHaveBeenCalledOnce();
  });

  it('d toggles debugPanelOpen false → true → false', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    expect(selectDebugPanelOpen(store.getState())).toBe(false);

    act(() => fireKey({ key: 'd' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(true);

    act(() => fireKey({ key: 'd' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(false);
  });

  it('D (uppercase) also toggles debugPanelOpen', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    act(() => fireKey({ key: 'D' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(true);
  });

  it('Cmd+K sets paletteOpen true', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    expect(selectPaletteOpen(store.getState())).toBe(false);
    act(() => fireKey({ key: 'k', metaKey: true }));
    expect(selectPaletteOpen(store.getState())).toBe(true);
  });

  it('Ctrl+K sets paletteOpen true', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    act(() => fireKey({ key: 'k', ctrlKey: true }));
    expect(selectPaletteOpen(store.getState())).toBe(true);
  });

  it('Tab with Shift is ignored (not a hide-UI press)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    act(() => fireKey({ key: 'Tab', shiftKey: true }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('Tab with Meta is ignored', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    act(() => fireKey({ key: 'Tab', metaKey: true }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('keys inside an INPUT element are ignored', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input));

    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);
    inputEl.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'd',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'target', { value: inputEl, configurable: true });
    act(() => window.dispatchEvent(event));

    expect(selectDebugPanelOpen(store.getState())).toBe(false);
    inputEl.remove();
  });
});
