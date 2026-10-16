/*
 * SectionPanel — the review of one section, fixed beside the article so it never covers the text its
 * rows point at: its marks and the feedback notes inside it. With `history` it is the read-only list of
 * what earlier applies carried out.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import type { DocsReviewMark } from '../../../../../../tools/site/@types/DocsReviewMark';
import { useDevOverlayEscape } from '../../overlay/useDevOverlayEscape';
import type { ReviewItem } from '../@types/ReviewItem';
import type { ReviewReveal } from '../@types/ReviewReveal';
import { itemKey } from '../itemKey';
import { placePanel } from '../placePanel';
import MarkRow from '../MarkRow/MarkRow.tsx';
import NoteRow from '../NoteRow/NoteRow.tsx';
import styles from './SectionPanel.module.css';

type SectionPanelProps = {
  title: string;
  items: ReviewItem[];
  /** The section's words before and after its marks apply; none for the history. */
  words?: { before: number; after: number };
  history?: boolean;
  applying: boolean;
  /** The consequence of applying this section, for the confirm line. */
  consequence: { text: string; nothing: boolean };
  reveal?: ReviewReveal;
  onState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  onNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  onGo: (target: DocsReviewMark | Element) => void;
  onDeleteNote: (id: string) => void;
  onWhole: (state: 'cut' | 'good') => void;
  onApply: () => void;
};

function SectionPanel({
  title,
  items,
  words,
  history = false,
  applying,
  consequence,
  reveal,
  onState,
  onNote,
  onGo,
  onDeleteNote,
  onWhole,
  onApply,
}: SectionPanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const apply = useRef<HTMLButtonElement>(null);
  const confirmYes = useRef<HTMLButtonElement>(null);
  const confirmNo = useRef<HTMLButtonElement>(null);
  const revealed = useRef<ReviewReveal>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [placement, setPlacement] = useState<CSSProperties>();
  const keys = items.map(itemKey).join('|');

  // Focus moves in, so the next key goes to the panel's own controls and not to a control left behind.
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  useLayoutEffect(() => {
    const place = () => setPlacement(placePanel());
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, []);

  // The row may not be there yet when the request arrives (a mark just made): it is tried again as rows change.
  useEffect(() => {
    if (!reveal || revealed.current === reveal) return;
    const row = root.current?.querySelector(`[data-row="${CSS.escape(reveal.key)}"]`);
    if (!row) return;
    revealed.current = reveal;
    row.scrollIntoView({ block: 'nearest' });
    // A rewrite shows two fields and the replacement is the one wanted; any other row has the reason field only.
    if (reveal.focus) [...row.querySelectorAll('textarea')].at(-1)?.focus({ preventScroll: true });
  }, [reveal, keys]);

  useEffect(() => {
    if (confirming) (consequence.nothing ? confirmNo : confirmYes).current?.focus();
  }, [confirming, consequence.nothing]);

  const closeConfirm = () => {
    setConfirming(false);
    apply.current?.focus();
  };

  useDevOverlayEscape((e) => {
    // A field's own Escape drops its edit; the panel stays for the next one.
    if (
      (e.target as Element | null)?.closest('textarea') &&
      root.current?.contains(e.target as Node)
    )
      return true;
    if (!confirming) return false;
    closeConfirm();
    return true;
  });

  return (
    <div
      ref={root}
      className={styles.root}
      style={placement}
      tabIndex={-1}
      data-overlay-ui=""
      data-review-panel=""
    >
      <strong className={styles.title}>{title}</strong>
      {words && (
        <div className={styles.words}>
          {words.before} → {words.after} words
        </div>
      )}
      <div>
        {items.map((item) =>
          item.kind === 'mark' ? (
            <MarkRow
              key={itemKey(item)}
              mark={item.mark}
              readOnly={history}
              onState={onState}
              onNote={onNote}
              onGo={onGo}
            />
          ) : (
            <NoteRow
              key={itemKey(item)}
              note={item.note}
              el={item.el}
              onGo={onGo}
              onDelete={onDeleteNote}
            />
          ),
        )}
      </div>
      {!history && (
        <div className={styles.foot}>
          <button className={styles.action} type="button" onClick={() => onWhole('cut')}>
            Cut whole section
          </button>
          <button className={styles.action} type="button" onClick={() => onWhole('good')}>
            Section is good
          </button>
          <button
            ref={apply}
            className={styles.action}
            type="button"
            disabled={applying}
            onClick={() => setConfirming(true)}
          >
            Apply section
          </button>
        </div>
      )}
      {confirming && !history && (
        <div className={styles.confirm}>
          <span className={styles.consequence} role="status">
            {consequence.text}
          </span>
          {!consequence.nothing && (
            <button
              ref={confirmYes}
              className={styles.action}
              type="button"
              onClick={() => {
                closeConfirm();
                onApply();
              }}
            >
              Confirm
            </button>
          )}
          <button ref={confirmNo} className={styles.action} type="button" onClick={closeConfirm}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default SectionPanel;
