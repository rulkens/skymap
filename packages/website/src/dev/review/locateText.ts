import { OVERLAY_UI } from '../overlay/overlayUi';
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
      node.parentElement?.closest(`script, style, ${OVERLAY_UI}`)
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
  // Matched with the spaces left out: two elements in one block (a link and its line) touch in
  // the DOM, while the browser's selection text puts a break between them.
  const { text, at } = foldText(raw);
  const kept: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] !== ' ') kept.push(at[i]!);
  const bare = want.replaceAll(' ', '');
  const hit = text.replaceAll(' ', '').indexOf(bare);
  if (hit < 0) return null;
  const from = kept[hit]!;
  const to = kept[hit + bare.length - 1]! + 1;
  return starts.flatMap(({ node, from: nodeFrom }) => {
    const start = Math.max(from, nodeFrom) - nodeFrom;
    const end = Math.min(to, nodeFrom + node.length) - nodeFrom;
    return start < end ? [{ node, start, end }] : [];
  });
}
