import type { PageNote } from '../overlay/@types/PageNote';

/**
 * Each note's element in the article, found by the selector the note was saved with. Run
 * before anything is added to the article's blocks: the selector counts siblings. Transient
 * `review-` classes in a selector are dropped; a note whose element is gone is left out.
 */
export function locateNotes(article: Element, notes: PageNote[]): Map<string, Element> {
  const found = new Map<string, Element>();
  for (const { id, note } of notes) {
    try {
      const el = document.querySelector(note.element.selector.replace(/\.review-[\w-]+/g, ''));
      if (el && article.contains(el)) found.set(id, el);
    } catch {
      /* a selector the browser cannot parse: the note belongs to no section */
    }
  }
  return found;
}
