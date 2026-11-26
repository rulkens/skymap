import { useEffect, type RefObject } from 'react';

/** useModalOpen — shows the native `<dialog>` as a modal while `open`, and closes it otherwise. */
export function useModalOpen(dialogRef: RefObject<HTMLDialogElement | null>, open: boolean): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [dialogRef, open]);
}
