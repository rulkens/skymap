import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import type { PageNote } from '../overlay/@types/PageNote';
import type { ReviewItem } from './@types/ReviewItem';
import type { ReviewSection } from './@types/ReviewSection';
import reviewPage from './ReviewPage/ReviewPage.module.css';

const levelOf = (heading: Element): number => Number(heading.localName.slice(1));
const follows = (from: Element, el: Element): boolean =>
  !!(from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

/**
 * The reviewed sections of a painted article: one per h2/h3 plus the intro (the h1 and
 * what precedes the first heading), each with the marks whose text starts inside it and
 * the notes whose element lies inside it, in page order. Run after painting.
 */
export function sectionsOf(
  article: Element,
  marks: DocsReviewMark[],
  notes: PageNote[],
  noteEls: Map<string, Element>,
): ReviewSection[] {
  const headings = [...article.querySelectorAll('h2, h3')];
  const h1 = article.querySelector('h1');
  const footer = article.querySelector(':scope > footer');
  const first = new Map<string, Element>();
  for (const el of article.querySelectorAll(`.${reviewPage.mark}`)) {
    const id = el.getAttribute('data-review-id');
    if (id && !first.has(id)) first.set(id, el);
  }
  const entries: { el: Element; item: ReviewItem }[] = [
    ...marks.flatMap((mark) =>
      first.has(mark.id)
        ? [{ el: first.get(mark.id)!, item: { kind: 'mark' as const, mark } }]
        : [],
    ),
    ...notes.flatMap((note) =>
      noteEls.has(note.id)
        ? [
            {
              el: noteEls.get(note.id)!,
              item: { kind: 'note' as const, note, el: noteEls.get(note.id)! },
            },
          ]
        : [],
    ),
  ].sort((a, b) => (a.el === b.el ? 0 : follows(a.el, b.el) ? -1 : 1));
  const ranges = [
    ...(h1 ? [{ heading: h1, start: article, end: headings[0] ?? footer }] : []),
    ...headings.map((heading, i) => ({
      heading,
      start: heading,
      end: headings.slice(i + 1).find((h) => levelOf(h) <= levelOf(heading)) ?? footer,
    })),
  ];
  return ranges
    .map(({ heading, start, end }) => ({
      heading,
      start,
      end,
      title: (heading.textContent ?? '').trim(),
      items: entries
        .filter(({ el, item }) => {
          const after = start === el || follows(start, el);
          const before =
            !end || !!(end.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING);
          // A note on a block that holds the whole section's heading belongs to no one section.
          const around =
            item.kind === 'note' && (el.contains(start) || (!!end && el.contains(end)));
          return after && before && !around;
        })
        .map(({ item }) => item),
    }))
    .filter((section) => section.items.length > 0);
}
