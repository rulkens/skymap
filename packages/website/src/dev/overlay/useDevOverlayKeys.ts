import { useEffect } from 'react';

import { devOverlay } from './devOverlay';

/** `f` turns the overlay on and off; Escape goes to whatever is open and, if nothing is, turns it off. */
export function useDevOverlayKeys(): void {
  useEffect(() => {
    // Capture phase, so the page's own handlers never see the keys the overlay owns.
    const onKey = (e: KeyboardEvent): void => {
      const typing = !!(e.target as HTMLElement | null)?.closest(
        'input, textarea, select, [contenteditable]',
      );
      if (e.key === 'Escape' && devOverlay.isOn()) {
        e.preventDefault();
        if (!devOverlay.escape(e)) devOverlay.setOn(false);
      } else if (e.key.toLowerCase() === 'f' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        devOverlay.setOn(!devOverlay.isOn());
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
