import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { foldText } from './foldText';
import { locateText } from './locateText';
import { reviewBlockOf } from './reviewBlockOf';

function tag(el: Element, mark: DocsReviewMark): void {
  el.classList.add('review-mark', `review-${mark.state}`);
  el.setAttribute('data-review-id', mark.id);
  const rewrite = mark.state === 'rewrite';
  if (rewrite && mark.after) el.classList.add('review-has-after');
  const notes = [
    mark.reason !== 'owner' && mark.reason,
    mark.why,
    rewrite && mark.how && `How: ${mark.how}`,
    rewrite && mark.after && `Replace with: ${mark.after}`,
  ];
  el.setAttribute('title', notes.filter(Boolean).join('\n'));
}

// The outermost block whose whole text is the mark's: a list item, not just the paragraph inside it.
function wholeBlock(node: Text, want: string): Element | null {
  const same = (el: Element): boolean => foldText(el.textContent ?? '').text.trim() === want;
  let block = reviewBlockOf(node);
  if (!block || !same(block)) return null;
  for (
    let up = reviewBlockOf(block.parentElement);
    up && same(up);
    up = reviewBlockOf(up.parentElement)
  )
    block = up;
  return block;
}

/** A cut heading takes its section with it, up to the next heading of its level or above. */
function tagSection(heading: Element): void {
  const level = Number(heading.localName.slice(1));
  for (let el = heading.nextElementSibling; el; el = el.nextElementSibling) {
    if (/^h[1-6]$/.test(el.localName) && Number(el.localName.slice(1)) <= level) break;
    el.classList.add('review-cut-section');
  }
}

/** Marks the mark's text in place and says whether it was found. */
export function paintMark(root: Element, mark: DocsReviewMark): boolean {
  const portions = locateText(root, mark.text);
  if (!portions?.length) return false;
  const block = wholeBlock(portions[0]!.node, foldText(mark.text).text.trim());
  if (block) {
    tag(block, mark);
    block.classList.add('review-block');
    if (mark.state === 'cut' && /^h[1-6]$/.test(block.localName)) tagSection(block);
    return true;
  }
  for (const { node, start, end } of portions) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const span = document.createElement('span');
    tag(span, mark);
    range.surroundContents(span);
  }
  return true;
}
