/* NoteRow — a feedback note's row in a section panel: the owner's words, the text of the element it was about, and a delete. */
import type { PageNote } from '../../overlay/@types/PageNote';
import { truncate } from '../truncate';
import styles from './NoteRow.module.css';

const SELECTED_CHARS = 90;

type NoteRowProps = {
  note: PageNote;
  /** The element the note was left on, in the article. */
  el: Element;
  onGo: (el: Element) => void;
  onDelete: (id: string) => void;
};

function NoteRow({ note, el, onGo, onDelete }: NoteRowProps) {
  return (
    <div className={styles.root} data-row={`note:${note.id}`}>
      <div className={styles.reason}>Note</div>
      <div className={styles.words}>{note.note.text}</div>
      <button className={styles.passage} type="button" onClick={() => onGo(el)}>
        {truncate(note.note.element.text, SELECTED_CHARS)}
      </button>
      <button className={styles.delete} type="button" onClick={() => onDelete(note.id)}>
        Delete note
      </button>
    </div>
  );
}

export default NoteRow;
