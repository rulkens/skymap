import { useEffect, type RefObject } from 'react';

/**
 * useBackdropClose — `closedby="any"` for browsers without it (Safari). A click
 * on the backdrop targets the dialog itself but lands outside its box; it must
 * also start there, so a text selection released over the backdrop keeps it open.
 */
export function useBackdropClose(dialogRef: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;
    const onBackdrop = (e: MouseEvent): boolean => {
      const r = dialog.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      return e.target === dialog && !inside;
    };
    let startedOnBackdrop = false;
    const onPointerDown = (e: PointerEvent): void => {
      startedOnBackdrop = onBackdrop(e);
    };
    const onClick = (e: MouseEvent): void => {
      if (startedOnBackdrop && onBackdrop(e)) dialog.close();
      startedOnBackdrop = false;
    };
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('click', onClick);
    };
  }, [dialogRef]);
}
