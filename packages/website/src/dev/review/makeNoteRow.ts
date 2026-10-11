import type { PageNote } from '../overlay/@types/PageNote';
import type { ReviewPanelActions } from './@types/ReviewPanelActions';
import type { ReviewRow } from './@types/ReviewRow';

const SELECTED_CHARS = 90;

/** A feedback note's row: the owner's words, the text of the element it was about, and a delete. */
export function makeNoteRow(note: PageNote, el: Element, actions: ReviewPanelActions): ReviewRow {
  const row = document.createElement('div');
  row.className = 'review-row review-row-note';
  const kind = document.createElement('div');
  kind.className = 'review-row-reason';
  kind.textContent = 'Note';
  const words = document.createElement('div');
  words.className = 'review-row-words';
  words.textContent = note.note.text;
  const selected = document.createElement('button');
  selected.type = 'button';
  selected.className = 'review-row-text';
  const picked = note.note.element.text;
  selected.textContent =
    picked.length > SELECTED_CHARS ? `${picked.slice(0, SELECTED_CHARS)}…` : picked;
  selected.addEventListener('click', () => actions.go(el));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'review-panel-action';
  remove.textContent = 'Delete note';
  remove.addEventListener('click', () => actions.deleteNote(note.id));
  row.append(kind, words, selected, remove);
  return { el: row, update: () => {}, focus: () => {} };
}
