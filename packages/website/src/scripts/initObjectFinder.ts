/*
 * initObjectFinder — the field over the object catalogue
 * (components/ObjectFinder.astro). Typing hides every row whose names and id
 * do not hold what was typed, then every list and section left with no row,
 * heading included: a section's heading is the `h2` before its ObjectList.
 */
import { foldText } from '../utils/foldText';

export function initObjectFinder(finder: HTMLElement): void {
  const field = finder.querySelector<HTMLElement>('.field')!;
  const input = finder.querySelector<HTMLInputElement>('input')!;
  const status = finder.querySelector<HTMLElement>('[role="status"]')!;
  const jump = finder.querySelector<HTMLElement>('.kinds')!;

  const rows = [...document.querySelectorAll<HTMLElement>('[data-object]')].map((row) => ({
    row,
    // The link's own word is not a name: only the names and the id are searched.
    text: foldText(
      [...row.querySelectorAll('.name, code')].map((part) => part.textContent ?? '').join(' '),
    ),
  }));

  // A section is its list and everything back to its heading.
  const sections = [...document.querySelectorAll<HTMLElement>('[data-objects]')].map((block) => {
    const parts: HTMLElement[] = [block];
    let before = block.previousElementSibling as HTMLElement | null;
    while (before && before.tagName !== 'H2') {
      parts.push(before);
      before = before.previousElementSibling as HTMLElement | null;
    }
    if (before) parts.push(before);
    const count = block.querySelector<HTMLElement>('.count');
    const jumps = before
      ? document.querySelectorAll(`[data-sections] a[href="#${before.id}"]`)
      : [];
    return { block, parts, count, jumps };
  });

  const narrow = () => {
    const query = foldText(input.value.trim());
    let shown = 0;
    for (const { row, text } of rows) {
      row.hidden = query !== '' && !text.includes(query);
      if (!row.hidden) shown++;
    }
    for (const sub of document.querySelectorAll<HTMLElement>('[data-object-sub]'))
      sub.hidden = !sub.querySelector('[data-object]:not([hidden])');
    for (const { block, parts, count, jumps } of sections) {
      const empty = !block.querySelector('[data-object]:not([hidden])');
      for (const part of parts) part.hidden = empty;
      // The count is of the whole section, and a jump to a hidden heading goes nowhere.
      if (count) count.hidden = query !== '';
      for (const jump of jumps) jump.toggleAttribute('aria-disabled', empty);
    }
    jump.hidden = query !== '';
    status.textContent =
      query === ''
        ? ''
        : shown === 0
          ? `No name or id here holds “${input.value.trim()}”.`
          : `${shown} of ${rows.length} rows`;
  };

  field.hidden = false;
  input.addEventListener('input', narrow);
  // A field the browser filled in again after Back.
  if (input.value !== '') narrow();
}
