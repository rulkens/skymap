import reviewPage from './ReviewPage/ReviewPage.module.css';

const { mark, cut, keep, rewrite, good, hasAfter, flash, cutSection, after } = reviewPage;

/** Takes every mark off the article again, so the next paint starts from the page as rendered. */
export function clearMarks(root: Element): void {
  // The replacements are overlay markup inside the text: gone first, or unwrapping a span would leave them loose.
  for (const added of root.querySelectorAll(`.${after}`)) added.remove();
  const parents = new Set<Node>();
  for (const span of root.querySelectorAll(`span.${mark}`)) {
    if (span.parentNode) parents.add(span.parentNode);
    span.replaceWith(...span.childNodes);
  }
  for (const block of root.querySelectorAll(`.${mark}`)) {
    block.classList.remove(mark, cut, keep, rewrite, good, hasAfter, flash);
    block.removeAttribute('data-review-id');
    block.removeAttribute('title');
  }
  for (const el of root.querySelectorAll(`.${cutSection}`)) el.classList.remove(cutSection);
  // The split text nodes are joined again, or the next mark could not find text across the seam.
  for (const parent of parents) parent.normalize();
}
