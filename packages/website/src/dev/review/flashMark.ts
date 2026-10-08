/** Scrolls to a mark's text and lights it for a moment, whether or not the marks are shown. */
export function flashMark(root: Element, id: string): void {
  const painted = [...root.querySelectorAll(`.review-mark[data-review-id="${CSS.escape(id)}"]`)];
  painted[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  for (const el of painted) el.classList.add('review-flash');
  setTimeout(() => painted.forEach((el) => el.classList.remove('review-flash')), 1500);
}
