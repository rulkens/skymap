import { useEffect } from 'react';

import { devOverlay } from './devOverlay';
import { switchedMode } from './switchedMode';

/**
 * `f` turns the overlay on and off; Escape goes to whatever is open and, if nothing is, turns it off.
 * While it is on, Tab flips between Notes and Marks and N and T pick one.
 */
export function useDevOverlayKeys(): void {
  useEffect(() => {
    // Capture phase, so the page's own handlers never see the keys the overlay owns.
    const onKey = (e: KeyboardEvent): void => {
      const typing = !!(e.target as HTMLElement | null)?.closest(
        'input, textarea, select, [contenteditable]',
      );
      const plain = !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (e.key === 'Escape' && devOverlay.isOn()) {
        e.preventDefault();
        if (!devOverlay.escape(e)) devOverlay.setOn(false);
      } else if (e.key.toLowerCase() === 'f' && plain) {
        devOverlay.setOn(!devOverlay.isOn());
      } else if (plain && devOverlay.isOn() && !e.shiftKey) {
        // Shift+Tab is left to the browser, so focus can still walk backwards.
        const next = switchedMode(e.key, devOverlay.mode());
        if (!next) return;
        e.preventDefault();
        devOverlay.setMode(next);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
