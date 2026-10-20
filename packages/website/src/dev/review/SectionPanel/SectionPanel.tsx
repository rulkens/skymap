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
import ApplyConfirm from '../ApplyConfirm/ApplyConfirm.tsx';
import MarkRow from '../MarkRow/MarkRow.tsx';
import NoteRow from '../NoteRow/NoteRow.tsx';
import styles from './SectionPanel.module.css';

type SectionPanelProps = {
  title: string;
  items: ReviewItem[];
  /** The section's words before and after its marks apply; none for the history. */
  words?: { before: number; after: number };
  applying: boolean;
  /** What applying this section would do, for the confirm line; none for the history, which is read-only. */
  apply?: { consequence: { text: string; nothing: boolean }; onApply: () => void };
  reveal?: ReviewReveal;
  onState: (mark: DocsReviewMark, state: DocsReviewMark['state']) => void;
  onNote: (mark: DocsReviewMark, key: 'why' | 'how' | 'after', value: string) => void;
  onGo: (target: DocsReviewMark | Element) => void;
  onDeleteNote: (id: string) => void;
  onWhole: (state: 'cut' | 'good') => void;
};

function SectionPanel({
  title,
  items,
  words,
  applying,
  apply,
  reveal,
  onState,
  onNote,
  onGo,
  onDeleteNote,
  onWhole,
}: SectionPanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const applyButton = useRef<HTMLButtonElement>(null);
  const revealed = useRef<ReviewReveal>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [placement, setPlacement] = useState<CSSProperties>();
  const keys = items.map(itemKey).join('|');
  const history = !apply;

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

  // A field's own Escape drops its edit; the panel stays for the next one.
  useDevOverlayEscape(
    (e) =>
      !!(e.target as Element | null)?.closest('textarea') &&
      !!root.current?.contains(e.target as Node),
  );

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
            ref={applyButton}
            className={styles.action}
            type="button"
            disabled={applying}
            onClick={() => setConfirming(true)}
          >
            Apply section
          </button>
        </div>
      )}
      {confirming && apply && (
        <ApplyConfirm
          stacked
          className={styles.confirm}
          consequence={apply.consequence}
          returnTo={applyButton}
          onApply={apply.onApply}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export default SectionPanel;
