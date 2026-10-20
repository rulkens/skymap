import { OVERLAY_UI } from '../overlay/overlayUi';
import type { ReviewSection } from './@types/ReviewSection';
import { reviewBlockOf } from './reviewBlockOf';

/**
 * A section's text joined the way locateText reads the page (a space wherever the block
 * changes), so a mark made of it is found again. Review UI inside the article is skipped.
 */
export function sectionText(article: Element, section: ReviewSection): string {
  const range = document.createRange();
  if (section.start === article) range.setStart(article, 0);
  else range.setStartBefore(section.start);
  if (section.end) range.setEndBefore(section.end);
  else range.setEnd(article, article.childNodes.length);
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      range.intersectsNode(node) && !node.parentElement?.closest(`script, style, ${OVERLAY_UI}`)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  let raw = '';
  let previous: Element | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const block = reviewBlockOf(node);
    if (raw && block !== previous) raw += ' ';
    raw += node.data;
    previous = block;
  }
  return raw.replace(/\s+/g, ' ').trim();
}
