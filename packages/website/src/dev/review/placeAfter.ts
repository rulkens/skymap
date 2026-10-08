import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';

/**
 * Puts the owner's replacement wording after each painted rewrite mark that has one:
 * the element "show result" displays in place of the original. Runs after every mark is
 * painted: the added text is review UI, and a mark must never match it.
 */
export function placeAfter(root: Element, marks: DocsReviewMark[]): void {
  for (const mark of marks) {
    if (mark.state !== 'rewrite' || !mark.after) continue;
    const painted = root.querySelectorAll(`.review-mark[data-review-id="${CSS.escape(mark.id)}"]`);
    const last = painted[painted.length - 1];
    if (!last) continue;
    const replacement = document.createElement(
      last.classList.contains('review-block') ? last.localName : 'span',
    );
    replacement.className = 'review-after';
    replacement.dataset.reviewUi = '';
    replacement.textContent = mark.after;
    last.after(replacement);
  }
}
