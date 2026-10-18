import type { DevOverlay } from './@types/DevOverlay';
import type { OverlayMode } from './@types/OverlayMode';
import { recall } from './recall';
import { remember } from './remember';

// Whether the overlay is on, kept per tab; the mode is kept per browser, in localStorage, so it outlives the tab.
const ON_KEY = 'skymap-feedback-on';
const MODE_KEY = 'skymap-overlay-mode';

/** Puts `item` first in `list`, so the newest registration is asked first; returns the way to take it out again. */
function register<T>(list: T[], item: T): () => void {
  list.unshift(item);
  return () => {
    const at = list.indexOf(item);
    if (at >= 0) list.splice(at, 1);
  };
}

/** The mode last used in this browser, Notes when none was stored. */
function recallMode(): OverlayMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'marks' ? 'marks' : 'notes';
  } catch {
    return 'notes';
  }
}

let on = recall(ON_KEY) !== null;
let mode = recallMode();
const listeners = new Set<() => void>();
const escapes: ((e: KeyboardEvent) => boolean)[] = [];
const presses: ((x: number, y: number) => boolean)[] = [];

export const devOverlay: DevOverlay = {
  isOn: () => on,
  setOn(next) {
    if (next === on) return;
    on = next;
    remember(ON_KEY, on ? '1' : null);
    for (const listener of listeners) listener();
  },
  mode: () => mode,
  setMode(next) {
    if (next === mode) return;
    mode = next;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* blocked storage: the mode lasts until reload */
    }
    for (const listener of listeners) listener();
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  onEscape: (handler) => register(escapes, handler),
  escape: (e) => escapes.some((handler) => handler(e)),
  onPress: (handler) => register(presses, handler),
  press: (x, y) => presses.some((handler) => handler(x, y)),
};
