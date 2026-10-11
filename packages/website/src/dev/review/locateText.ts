import type { ReviewPortion } from './@types/ReviewPortion';
import { foldText } from './foldText';
import { reviewBlockOf } from './reviewBlockOf';

/**
 * Where the first occurrence of `needle` sits in the rendered text under `root`, as
 * the pieces of text nodes it covers, or null. The text nodes are joined with a space
 * wherever the block changes, so a range can run on from one paragraph to the next.
 */
export function locateText(root: Element, needle: string): ReviewPortion[] | null {
  const want = foldText(needle).text.trim();
  if (!want) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('script, style, [data-review-ui]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let raw = '';
  const starts: { node: Text; from: number }[] = [];
  let previous: Element | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const block = reviewBlockOf(node);
    if (starts.length > 0 && block !== previous) raw += ' ';
    starts.push({ node, from: raw.length });
    raw += node.data;
    previous = block;
  }
  const { text, at } = foldText(raw);
  const hit = text.indexOf(want);
  if (hit < 0) return null;
  const from = at[hit]!;
  const to = at[hit + want.length - 1]! + 1;
  return starts.flatMap(({ node, from: nodeFrom }) => {
    const start = Math.max(from, nodeFrom) - nodeFrom;
    const end = Math.min(to, nodeFrom + node.length) - nodeFrom;
    return start < end ? [{ node, start, end }] : [];
  });
}
