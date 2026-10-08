import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { makePencil } from './makePencil';

/**
 * Gives each painted rewrite or good mark its pencil and, when the owner has written a
 * replacement, the replacement element that "hide cut text" shows in its place. Runs
 * after every mark is painted: the added text is review UI, and a mark must never match it.
 */
export function placeAfter(root: Element, marks: DocsReviewMark[]): void {
  for (const mark of marks) {
    if (mark.state !== 'rewrite' && mark.state !== 'good') continue;
    const painted = root.querySelectorAll(`.review-mark[data-review-id="${CSS.escape(mark.id)}"]`);
    const last = painted[painted.length - 1];
    if (!last) continue;
    last.append(makePencil(mark.id, !!(mark.after || mark.how || mark.why)));
    if (mark.state !== 'rewrite' || !mark.after) continue;
    const replacement = document.createElement(
      last.classList.contains('review-block') ? last.localName : 'span',
    );
    replacement.className = 'review-after';
    replacement.dataset.reviewUi = '';
    replacement.textContent = mark.after;
    replacement.append(makePencil(mark.id, true));
    last.after(replacement);
  }
}
