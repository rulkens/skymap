/**
 * The `?` overlay's open state. Closing it gives focus back to whatever opened it (the `?` button,
 * or the dock when the key opened it), so the next key works with the mouse untouched (ui-ux rule 9).
 */
import { useCallback, useRef, useState, type RefObject } from 'react';

export function useKeysOverlay(root: RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    const back = opener.current?.isConnected ? opener.current : root.current;
    back?.focus({ preventScroll: true });
  }, [root]);
  const toggle = useCallback(() => {
    if (open) return close();
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, [open, close]);
  return { open, toggle, close };
}
