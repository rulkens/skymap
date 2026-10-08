import type { DevOverlay } from './@types/DevOverlay';
import { recall } from './recall';
import { remember } from './remember';

const MODE_KEY = 'skymap-feedback-on';

let on = recall(MODE_KEY) !== null;
const listeners: ((on: boolean) => void)[] = [];
const escapes: ((e: KeyboardEvent) => boolean)[] = [];
const presses: ((x: number, y: number) => boolean)[] = [];

export const devOverlay: DevOverlay = {
  isOn: () => on,
  setOn(next) {
    if (next === on) return;
    on = next;
    remember(MODE_KEY, on ? '1' : null);
    for (const listener of listeners) listener(on);
  },
  subscribe: (listener) => void listeners.push(listener),
  onEscape: (handler) => void escapes.push(handler),
  onPress: (handler) => void presses.push(handler),
  press: (x, y) => presses.some((handler) => handler(x, y)),
};

// Capture phase, so the page's own handlers never see the keys the overlay owns.
document.addEventListener(
  'keydown',
  (e) => {
    const typing = !!(e.target as HTMLElement | null)?.closest(
      'input, textarea, select, [contenteditable]',
    );
    if (e.key === 'Escape' && on) {
      e.preventDefault();
      if (!escapes.some((handler) => handler(e))) devOverlay.setOn(false);
    } else if (e.key.toLowerCase() === 'f' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      devOverlay.setOn(!on);
    }
  },
  true,
);
