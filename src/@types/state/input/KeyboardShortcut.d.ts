/**
 * KeyboardShortcut — one declarative keyboard binding: which key(s) fire it,
 * what it dispatches, and whether it swallows the browser default.
 *
 * A shortcut is DATA, not control flow. The listener (`createKeyboardListener`)
 * registers each entry's `keys` with hotkeys-js and, on a match, decides the
 * default-swallow synchronously (see `preventDefault`) then reports the key
 * outward on the channel; the consuming saga routes the key to `run`.
 *
 * ### `run`
 *
 * The action(s) this key dispatches, resolved against the CURRENT store state so
 * a shortcut can branch on live state (e.g. play/pause toggles read the live
 * `paused` flag rather than a captured snapshot). Return a single `Action`, a
 * list of actions to dispatch in order, or `null` to dispatch nothing (the key
 * matched but the current state means it is a no-op).
 *
 * ### `preventDefault`
 *
 * Whether to call `event.preventDefault()` inside the DOM event tick — the only
 * moment early enough to cancel a browser default (Space/arrows scroll the
 * page; Tab traverses focus). A saga consuming the emitted key runs a tick
 * later, too late to cancel. So the decision lives on the shortcut and the
 * listener applies it synchronously, a static flag: `true` cancels the browser
 * default for this key, omitted (or `false`) leaves it alone.
 */

import type { Action } from '@reduxjs/toolkit';
import type { RootState } from '../../../store/types';

export type KeyboardShortcut = {
  readonly keys: string;
  readonly run: (state: RootState) => Action | readonly Action[] | null;
  readonly preventDefault?: boolean;
};
