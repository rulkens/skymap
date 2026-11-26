/**
 * A focused button that turns disabled (Undo after the last undo, Zoom out at Fit) drops focus to
 * the page, where the dock's keys no longer land. This moves it to the dock root instead. A
 * MutationObserver fires before the browser's focus fix-up, while the button still holds focus.
 */
import { useEffect, type RefObject } from 'react';

export function useFocusRescue(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dock = root.current;
    if (dock === null) return;
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && active.disabled && dock.contains(active)) {
        dock.focus({ preventScroll: true });
      }
    });
    observer.observe(dock, { subtree: true, attributeFilter: ['disabled'] });
    return () => observer.disconnect();
  }, [root]);
}
