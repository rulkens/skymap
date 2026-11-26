import type { KeyboardEvent } from 'react';

/**
 * Enter in the load form. Load is off while a field is wrong, so Enter shows which
 * (`showWrong`) and focuses the first; a radio or a checkbox has no implicit
 * submission, so on one Enter still submits.
 */
export function handleFormEnter(
  e: KeyboardEvent<HTMLFormElement>,
  wrong: readonly string[],
  showWrong: () => void,
): void {
  if (e.key !== 'Enter') return;
  if (wrong.length > 0) {
    showWrong();
    (e.currentTarget.elements.namedItem(wrong[0]!) as HTMLInputElement | null)?.focus();
  }
  const type = (e.target as HTMLInputElement).type;
  if (type === 'radio' || type === 'checkbox') {
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
}
