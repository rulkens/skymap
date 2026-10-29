import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import reviewPage from './ReviewPage/ReviewPage.module.css';

/**
 * Puts the owner's replacement wording after each painted rewrite mark that has one:
 * the element "show result" displays in place of the original. Runs after every mark is
 * painted: the added text is review UI, and a mark must never match it.
 */
export function placeAfter(root: Element, marks: DocsReviewMark[]): void {
  for (const mark of marks) {
    if (mark.state !== 'rewrite' || !mark.after) continue;
    const painted = root.querySelectorAll(
      `.${reviewPage.mark}[data-review-id="${CSS.escape(mark.id)}"]`,
    );
    const last = painted[painted.length - 1];
    if (!last) continue;
    // A whole block is replaced by a block of its kind; a phrase by a span, which is what it is wrapped in.
    const replacement = document.createElement(last.localName);
    replacement.className = reviewPage.after!;
    replacement.dataset.overlayUi = '';
    replacement.textContent = mark.after;
    last.after(replacement);
  }
}
