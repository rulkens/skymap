import type { DevOverlay } from './@types/DevOverlay';
import { recall } from './recall';
import { recallMode } from './recallMode';
import { register } from './register';
import { remember } from './remember';
import { rememberMode } from './rememberMode';

// Whether the overlay is on, kept per tab; the mode is kept per browser (modeKey.ts).
const ON_KEY = 'skymap-feedback-on';

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
    rememberMode(mode);
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
