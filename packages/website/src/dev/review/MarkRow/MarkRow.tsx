/*
 * MarkRow — a mark in a section panel: its state, the passage, the owner's reason, and one note. A rewrite
 * asks what should change and takes the owner's own replacement text instead of a reason.
 * `readOnly` is history: what an apply carried out, as it was ruled.
 */
import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';
import { cx } from '../../../utils/cx.ts';
import NoteField from '../NoteField/NoteField.tsx';
import { truncate } from '../truncate';
import styles from './MarkRow.module.css';

const STATES = ['cut', 'keep', 'rewrite', 'good'] as const;
const PASSAGE_CHARS = 90;

type MarkRowProps = {
  mark: DocsReviewMark;
  readOnly?: boolean;
  onState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  onNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  onGo: (mark: DocsReviewMark) => void;
};

function MarkRow({ mark, readOnly = false, onState, onNote, onGo }: MarkRowProps) {
  const rewrite = mark.state === 'rewrite';
  return (
    <div className={cx(styles.root, readOnly && styles.applied)} data-row={`mark:${mark.id}`}>
      <div className={styles.head}>
        {STATES.map((state) => (
          <button
            key={state}
            className={styles.state}
            type="button"
            aria-pressed={mark.state === state}
            disabled={readOnly}
            onClick={() => onState(mark, state)}
          >
            {state}
          </button>
        ))}
        <button
          className={styles.passage}
          type="button"
          disabled={readOnly}
          onClick={() => onGo(mark)}
        >
          {truncate(mark.text, PASSAGE_CHARS)}
        </button>
      </div>
      {mark.reason !== 'owner' && <div className={styles.reason}>{mark.reason}</div>}
      {rewrite ? (
        <>
          <NoteField
            label="What should change (optional)"
            saveLabel="Save"
            value={mark.how ?? ''}
            disabled={readOnly}
            onSave={(value) => onNote(mark, 'how', value)}
          />
          <NoteField
            label="Your replacement text (optional)"
            saveLabel="Save text"
            value={mark.after ?? ''}
            placeholder={mark.text}
            disabled={readOnly}
            onSave={(value) => onNote(mark, 'after', value)}
          />
        </>
      ) : (
        <NoteField
          label="Why (optional)"
          saveLabel="Save"
          value={mark.why ?? ''}
          disabled={readOnly}
          onSave={(value) => onNote(mark, 'why', value)}
        />
      )}
    </div>
  );
}

export default MarkRow;
