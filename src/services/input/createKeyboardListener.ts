/**
 * createKeyboardListener — wrap `hotkeys-js` in a redux-saga `eventChannel` so a
 * saga can `take` keystrokes as plain action-like events.
 *
 * `hotkeys-js` owns the parts that MUST stay synchronous and DOM-side: the
 * keydown listener, the combo/keyname parsing (`right`, `left`, `space`, `⌘+k`),
 * and the platform fold. The caller passes a list of `KeyboardShortcut`s (which
 * keys, plus each key's `preventDefault` flag); the channel carries only the
 * matched key string outward, and the routing (key → which action) lives in
 * the consuming saga.
 *
 * ### Why preventDefault here, not in the saga
 *
 * `event.preventDefault()` must run inside the DOM event tick. A saga consuming
 * the emitted key runs a tick later — too late to cancel the browser default
 * (Space/arrows scroll the page). So the listener applies each shortcut's
 * static `preventDefault` flag synchronously, then the channel reports which
 * key fired.
 *
 * ### Form-field guard
 *
 * `hotkeys.filter` gates whether a keydown is even considered. hotkeys-js's
 * built-in filter already ignores `input` / `textarea` / `select` (with its own
 * exceptions for e.g. `range`/`checkbox`/`button` inputs and `readOnly`
 * fields); the filter below composes over that builtin rather than
 * reimplementing it, adding only the `contentEditable` case it doesn't cover
 * (previously done by hand in the `useKeyboardShortcuts` hook).
 *
 * The teardown returned to `eventChannel` unbinds every registered key set when
 * the channel is closed, so `hotkeys` holds no listener once the caller is done.
 */

import hotkeys from 'hotkeys-js';
import { eventChannel, type EventChannel } from 'redux-saga';

import type { KeyboardShortcut } from '../../@types/state/input/KeyboardShortcut';

// Compose over hotkeys-js's built-in input/textarea/select guard (which
// already carves out range/checkbox/button inputs and readOnly fields) and
// additionally ignore contentEditable targets (rich-text editors), which the
// builtin filter does not cover.
const builtinFilter = hotkeys.filter;
hotkeys.filter = (event) =>
  builtinFilter(event) && !((event.target as HTMLElement | null)?.isContentEditable);

export function createKeyboardListener(shortcuts: readonly KeyboardShortcut[]): EventChannel<string> {
  return eventChannel<string>((emit) => {
    for (const shortcut of shortcuts) {
      hotkeys(shortcut.keys, (event, handler) => {
        if (shortcut.preventDefault) event.preventDefault();
        emit(handler.key);
      });
    }
    return () => {
      for (const shortcut of shortcuts) hotkeys.unbind(shortcut.keys);
    };
  });
}
