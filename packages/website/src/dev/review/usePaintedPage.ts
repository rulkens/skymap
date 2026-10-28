import { useLayoutEffect, useState } from 'react';

import type { DocsReviewMark } from '../../../../../tools/site/@types/DocsReviewMark';
import { usePageNotes } from '../overlay/usePageNotes';
import type { ReviewSection } from './@types/ReviewSection';
import { clearMarks } from './clearMarks';
import { locateNotes } from './locateNotes';
import { paintMark } from './paintMark';
import { placeAfter } from './placeAfter';
import reviewPage from './ReviewPage/ReviewPage.module.css';
import { sectionsOf } from './sectionsOf';

const NOTHING = { sections: [] as ReviewSection[], missing: [] as string[] };

/**
 * Paints the live marks into the article's own text and reads back the sections they fall in, plus
 * the marks whose text was not found. This is DOM work on page content React does not render, so it
 * is an effect: it runs before the browser paints, and its cleanup takes every mark off again.
 */
export function usePaintedPage(
  article: Element,
  active: boolean,
  marks: DocsReviewMark[],
  marksShown: boolean,
) {
  const { notes } = usePageNotes();
  const [painted, setPainted] = useState(NOTHING);

  useLayoutEffect(() => {
    if (!active) return setPainted(NOTHING);
    const missing = marks.filter((mark) => !paintMark(article, mark)).map((mark) => mark.id);
    // Notes are found by selectors that count siblings: before the replacements are added.
    const noteEls = locateNotes(article, notes);
    placeAfter(article, marks);
    // The marks are painted either way (the panel finds its passages by them); unshown, they leave no trace, tooltips included.
    if (!marksShown)
      for (const el of article.querySelectorAll(`.${reviewPage.mark}`)) el.removeAttribute('title');
    setPainted({ sections: sectionsOf(article, marks, notes, noteEls), missing });
    return () => clearMarks(article);
  }, [article, active, marks, notes, marksShown]);

  return painted;
}
