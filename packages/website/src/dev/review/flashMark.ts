/** Scrolls to a passage's elements and lights them for a moment, whether or not the marks are shown. */
export function flashMark(painted: Element[]): void {
  painted[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  for (const el of painted) el.classList.add('review-flash');
  setTimeout(() => painted.forEach((el) => el.classList.remove('review-flash')), 1500);
}
