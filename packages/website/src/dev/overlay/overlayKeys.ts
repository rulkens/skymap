/** The one-line key reminder for the overlay: the feedback tool's keys, and the review's when the page has a review. */
export function overlayKeys(review: boolean): string {
  const feedback = 'F: overlay off · click or drag the page: note';
  if (!review) return `${feedback} · Esc: cancel`;
  return `${feedback} (hold Shift to select text) · click a section icon: its review · select + C: cut · W: rewrite · G: good · M: show marks in the text (click one: cut → keep → rewrite → good) · H: show result`;
}
