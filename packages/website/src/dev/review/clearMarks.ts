/** Takes every mark off the article again, so the next paint starts from the page as rendered. */
export function clearMarks(root: Element): void {
  const parents = new Set<Node>();
  for (const span of root.querySelectorAll('span.review-mark')) {
    if (span.parentNode) parents.add(span.parentNode);
    span.replaceWith(...span.childNodes);
  }
  for (const block of root.querySelectorAll('.review-mark')) {
    block.classList.remove(
      'review-mark',
      'review-block',
      'review-cut',
      'review-keep',
      'review-rewrite',
    );
    block.removeAttribute('data-review-id');
    block.removeAttribute('title');
  }
  for (const el of root.querySelectorAll('.review-cut-section'))
    el.classList.remove('review-cut-section');
  // The split text nodes are joined again, or the next mark could not find text across the seam.
  for (const parent of parents) parent.normalize();
}
