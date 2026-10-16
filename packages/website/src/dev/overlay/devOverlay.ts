import type { DevOverlay } from './@types/DevOverlay';
import { recall } from './recall';
import { register } from './register';
import { remember } from './remember';

const MODE_KEY = 'skymap-feedback-on';

let on = recall(MODE_KEY) !== null;
const listeners = new Set<() => void>();
const escapes: ((e: KeyboardEvent) => boolean)[] = [];
const presses: ((x: number, y: number) => boolean)[] = [];

export const devOverlay: DevOverlay = {
  isOn: () => on,
  setOn(next) {
    if (next === on) return;
    on = next;
    remember(MODE_KEY, on ? '1' : null);
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
