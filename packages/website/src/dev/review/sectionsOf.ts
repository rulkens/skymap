import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import type { ReviewSection } from './@types/ReviewSection';

const levelOf = (heading: Element): number => Number(heading.localName.slice(1));

/**
 * The reviewed sections of a painted article: one per h2/h3 plus the intro (the h1 and
 * what precedes the first heading), each with the marks whose text starts inside it.
 * Run after painting and before the icons go into the headings, so titles are clean.
 */
export function sectionsOf(article: Element, marks: DocsReviewMark[]): ReviewSection[] {
  const headings = [...article.querySelectorAll('h2, h3')];
  const h1 = article.querySelector('h1');
  const footer = article.querySelector(':scope > footer');
  const first = new Map<string, Element>();
  for (const el of article.querySelectorAll('.review-mark')) {
    const id = el.getAttribute('data-review-id');
    if (id && !first.has(id)) first.set(id, el);
  }
  const ranges = [
    ...(h1 ? [{ heading: h1, start: article, end: headings[0] ?? footer }] : []),
    ...headings.map((heading, i) => ({
      heading,
      start: heading,
      end: headings.slice(i + 1).find((h) => levelOf(h) <= levelOf(heading)) ?? footer,
    })),
  ];
  const follows = (from: Element, el: Element): boolean =>
    !!(from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const inOrder = [...marks]
    .filter((mark) => first.has(mark.id))
    .sort((a, b) => (follows(first.get(a.id)!, first.get(b.id)!) ? -1 : 1));
  return ranges
    .map(({ heading, start, end }) => ({
      heading,
      start,
      end,
      title: (heading.textContent ?? '').trim(),
      marks: inOrder.filter((mark) => {
        const el = first.get(mark.id)!;
        const after = start === el || follows(start, el);
        const before =
          !end || !!(end.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
        return after && before;
      }),
    }))
    .filter((section) => section.marks.length > 0);
}
