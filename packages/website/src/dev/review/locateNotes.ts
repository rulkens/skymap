import type { PageNote } from '../overlay/@types/PageNote';
import reviewPage from './ReviewPage/ReviewPage.module.css';

// The classes review mode paints on the page come and go; a selector saved while one was on must not need it.
const PAINTED = new RegExp(`\\.(?:${Object.values(reviewPage).join('|')})(?![\\w-])`, 'g');

/**
 * Each note's element in the article, found by the selector the note was saved with. Run
 * before anything is added to the article's blocks: the selector counts siblings. Painted
 * classes in a selector are dropped; a note whose element is gone is left out.
 */
export function locateNotes(article: Element, notes: PageNote[]): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const { id, note } of notes) {
    try {
      const el = document.querySelector(note.element.selector.replace(PAINTED, ''));
      if (el && article.contains(el)) found.set(id, el);
    } catch {
      /* a selector the browser cannot parse: the note belongs to no section */
    }
  }
  return found;
}
