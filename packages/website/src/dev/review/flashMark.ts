import reviewPage from './ReviewPage/ReviewPage.module.css';

/** Scrolls to a passage's elements and lights them for a moment, whether or not the marks are shown. */
export function flashMark(painted: Element[]): void {
  painted[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  for (const el of painted) el.classList.add(reviewPage.flash);
  setTimeout(() => painted.forEach((el) => el.classList.remove(reviewPage.flash)), 1500);
}
