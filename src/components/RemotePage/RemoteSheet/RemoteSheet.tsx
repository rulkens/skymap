/**
 * RemoteSheet — a library sheet rising over the deck. Not modal: no trap, no dim, so the pad above
 * stays live while the operator chooses. Closing slides it out first, so `onClose` fires after
 * SHEET_LEAVE_MS and the page moves focus back to the tile then.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import { REMOTE_SHEETS } from '../../../data/remote/remoteSheets';
import { SHEET_LEAVE_MS } from '../../../data/remote/sheetLeaveMs';
import type { RemoteSheetId } from '../../../@types/remote/RemoteSheetId';
import controls from '../remoteControls.module.css';
import styles from './RemoteSheet.module.css';

export type RemoteSheetProps = {
  readonly id: RemoteSheetId;
  readonly onClose: () => void;
  /** 'field' focuses the first input (Search); the default is the heading. */
  readonly initialFocus?: 'heading' | 'field';
  /** A short state beside the heading, such as "2 of 9 on". */
  readonly note?: string;
  readonly children: ReactNode;
};

function RemoteSheet({ id, onClose, initialFocus = 'heading', note, children }: RemoteSheetProps) {
  const headingId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [leaving, setLeaving] = useState(false);
  const sheet = REMOTE_SHEETS.find((s) => s.id === id)!;

  useEffect(() => {
    if (initialFocus === 'field') rootRef.current?.querySelector('input')?.focus();
    else headingRef.current?.focus();
  }, [initialFocus]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onClose, SHEET_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // An IME composition uses Escape to cancel; a filled search field stops it to clear itself first.
      if (e.key === 'Escape' && !e.isComposing) setLeaving(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      className={cx(styles.root, leaving && styles.leaving)}
    >
      <div className={styles.head}>
        <RemoteIcon glyph={sheet.glyph} />
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
          {sheet.label}
        </h2>
        {note && <span className={styles.note}>{note}</span>}
        <button
          type="button"
          className={cx(controls.button, styles.close)}
          onClick={() => setLeaving(true)}
        >
          <RemoteIcon glyph="close" />
          Close
        </button>
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export default RemoteSheet;
