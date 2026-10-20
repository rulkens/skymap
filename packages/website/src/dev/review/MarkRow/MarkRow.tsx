/*
 * MarkRow — a mark in a section panel: its state, the passage, the owner's reason and, for a rewrite, the
 * note for the rewriter and the replacement text. `readOnly` is history: what an apply carried out, as it was ruled.
 */
import { useState } from 'react';

import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';
import { cx } from '../../../utils/cx.ts';
import NoteField from '../NoteField/NoteField.tsx';
import { truncate } from '../truncate';
import styles from './MarkRow.module.css';

const STATES = ['cut', 'keep', 'rewrite', 'good'] as const;
const PASSAGE_CHARS = 90;
// The one rewrite field edits one of these at a time; the control above it names which.
const KINDS = [
  {
    key: 'how',
    segment: 'Note for the rewriter',
    save: 'Save note',
    hint: 'shorter; say where the switch is',
  },
  { key: 'after', segment: 'Replacement text', save: 'Save replacement', hint: '' },
] as const;

type MarkRowProps = {
  mark: DocsReviewMark;
  readOnly?: boolean;
  onState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  onNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  onGo: (mark: DocsReviewMark) => void;
};

function MarkRow({ mark, readOnly = false, onState, onNote, onGo }: MarkRowProps) {
  const [kind, setKind] = useState<(typeof KINDS)[number]>(KINDS[0]);
  const shown = kind.key === 'how' ? (mark.how ?? '') : (mark.after ?? mark.text);

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
      <NoteField
        label="Why? (optional)"
        saveLabel="Save why"
        value={mark.why ?? ''}
        disabled={readOnly}
        onSave={(value) => onNote(mark, 'why', value)}
      />
      {mark.state === 'rewrite' && (
        <div>
          <div className={styles.segment}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                className={styles.choice}
                type="button"
                aria-pressed={k === kind}
                disabled={readOnly}
                onClick={() => setKind(k)}
              >
                {k.segment}
              </button>
            ))}
          </div>
          <NoteField
            ariaLabel={kind.segment}
            placeholder={kind.hint}
            saveLabel={kind.save}
            value={shown}
            disabled={readOnly}
            onSave={(value) => onNote(mark, kind.key, value)}
          />
          {/* What the owner has written, as labelled lines, so no value hides behind the control. */}
          {mark.how && <div className={styles.line}>Note: {mark.how}</div>}
          {mark.after && <div className={styles.line}>Replacement: {mark.after}</div>}
        </div>
      )}
    </div>
  );
}

export default MarkRow;
