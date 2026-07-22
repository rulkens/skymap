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

import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { createAppStore } from '../../src/store/createAppStore';
import { buildInitialSettings } from '../../src/state/settings/initialState';
import {
  selectUiHidden,
  selectDebugPanelOpen,
  selectPaletteOpen,
} from '../../src/state/ui/selectors';
import { setPaletteOpen, toggleUiHidden, toggleDebugPanelOpen } from '../../src/state/ui/uiSlice';
import { exitTour } from '../../src/state/tour/tourActions';
import { goHome } from '../../src/state/selection/goHome';
import { selectTimeState } from '../../src/state/time/selectors';
import { RATE_LADDER } from '../../src/data/time/rateLadder';

/** Fire a keydown on window with the given init options. */
function fireKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

/** Build the minimal hook input that wires everything through a real store. */
function makeInput(store: ReturnType<typeof createAppStore>['store']) {
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
  let store: ReturnType<typeof createAppStore>['store'];

  beforeEach(() => {
    store = createAppStore({ settings: buildInitialSettings() }).store;
  });

  it('Tab toggles uiHidden false → true → false (proves toggle, no stale closure)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    expect(selectUiHidden(store.getState())).toBe(false);

    act(() => fireKey({ key: 'Tab' }));
    expect(selectUiHidden(store.getState())).toBe(true);

    act(() => fireKey({ key: 'Tab' }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('Tab fires e.preventDefault() (cancelable event is cancelled)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    act(() => window.dispatchEvent(event));
    expect(preventSpy).toHaveBeenCalledOnce();
  });

  it('d toggles debugPanelOpen false → true → false', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    expect(selectDebugPanelOpen(store.getState())).toBe(false);

    act(() => fireKey({ key: 'd' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(true);

    act(() => fireKey({ key: 'd' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(false);
  });

  it('D (uppercase) also toggles debugPanelOpen', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'D' }));
    expect(selectDebugPanelOpen(store.getState())).toBe(true);
  });

  it('Cmd+K sets paletteOpen true', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    expect(selectPaletteOpen(store.getState())).toBe(false);
    act(() => fireKey({ key: 'k', metaKey: true }));
    expect(selectPaletteOpen(store.getState())).toBe(true);
  });

  it('Ctrl+K sets paletteOpen true', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'k', ctrlKey: true }));
    expect(selectPaletteOpen(store.getState())).toBe(true);
  });

  it('Tab with Shift is ignored (not a hide-UI press)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'Tab', shiftKey: true }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('Tab with Meta is ignored', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'Tab', metaKey: true }));
    expect(selectUiHidden(store.getState())).toBe(false);
  });

  it('Esc clears selection and dispatches exitTour', () => {
    const input = makeInput(store);
    // exitTour is reducer-less, so we assert the dispatch rather than state.
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'Escape' }));
    expect(dispatchSpy).toHaveBeenCalledWith(exitTour());
  });

  it('h and e both dispatch goHome (shared home intent)', () => {
    const input = makeInput(store);
    // goHome is reducer-less, so we assert the dispatch rather than state.
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    act(() => fireKey({ key: 'h' }));
    expect(dispatchSpy).toHaveBeenCalledWith(goHome());

    dispatchSpy.mockClear();
    act(() => fireKey({ key: 'e' }));
    expect(dispatchSpy).toHaveBeenCalledWith(goHome());
  });

  // The tour navigation keys (→/←/Space) moved to `watchTourKeyboardSaga`,
  // which binds them only while a tour runs. The hook no longer handles them.

  it('[ and ] step the rate down and up by one detent', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    // Read the boot detent from the store rather than hard-coding it, so this
    // stays a relative step-by-one assertion independent of the initial index.
    const start = selectTimeState(store.getState()).rateIndex;

    act(() => fireKey({ key: ']' }));
    expect(selectTimeState(store.getState()).rateIndex).toBe(start + 1);

    act(() => fireKey({ key: '[' }));
    expect(selectTimeState(store.getState()).rateIndex).toBe(start);
  });

  it('[ and ] clamp at the ladder ends (no wrap past the last detent)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    // Press ] past the top detent; the index must saturate, not overflow.
    for (let i = 0; i < RATE_LADDER.length + 2; i++) act(() => fireKey({ key: ']' }));
    expect(selectTimeState(store.getState()).rateIndex).toBe(RATE_LADDER.length - 1);
  });

  it('\\ toggles play/pause (paused false → true → false)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    expect(selectTimeState(store.getState()).paused).toBe(false);

    act(() => fireKey({ key: '\\' }));
    expect(selectTimeState(store.getState()).paused).toBe(true);

    act(() => fireKey({ key: '\\' }));
    expect(selectTimeState(store.getState()).paused).toBe(false);
  });

  it('Shift+N goes live (mode returns to live after a manual step)', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    // Any rate step switches the clock to manual mode…
    act(() => fireKey({ key: ']' }));
    expect(selectTimeState(store.getState()).mode).toBe('manual');

    // …and Shift+N snaps it back to live.
    act(() => fireKey({ key: 'N', shiftKey: true }));
    expect(selectTimeState(store.getState()).mode).toBe('live');
  });

  it('time keys are ignored while a form field is focused', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);
    inputEl.focus();

    // `\` would toggle pause if the guard let it through.
    const event = new KeyboardEvent('keydown', { key: '\\', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: inputEl, configurable: true });
    act(() => window.dispatchEvent(event));

    expect(selectTimeState(store.getState()).paused).toBe(false);
    inputEl.remove();
  });

  it('keys inside an INPUT element are ignored', () => {
    const input = makeInput(store);
    renderHook(() => useKeyboardShortcuts(input), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(Provider, { store, children }),
    });

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
