/*
 * FeedbackPanel — the note form beside the area chosen. `onSend` saves the note and ends the
 * selection; when it rejects, the reason shows here and the words stay.
 */
import { useLayoutEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react';

import type { FeedbackRect } from '../../../../../../tools/site/@types/FeedbackRect';
import { useViewport } from '../../overlay/useViewport';
import { cx } from '../../../utils/cx.ts';
import type { FeedbackPoint } from '../@types/FeedbackPoint';
import { panelPosition } from '../panelPosition';
import { viewRect } from '../viewRect';
import FeedbackOutline from '../FeedbackOutline/FeedbackOutline.tsx';
import styles from './FeedbackPanel.module.css';

type FeedbackPanelProps = {
  /** The chosen area, in page coordinates. */
  rect: FeedbackRect;
  text: string;
  onText: (text: string) => void;
  onSend: () => Promise<void>;
  onCancel: () => void;
  textRef: Ref<HTMLTextAreaElement>;
};

function FeedbackPanel({ rect, text, onText, onSend, onCancel, textRef }: FeedbackPanelProps) {
  const viewport = useViewport();
  const area = viewRect(rect, viewport);
  const form = useRef<HTMLFormElement>(null);
  const [position, setPosition] = useState<FeedbackPoint>();
  const [problem, setProblem] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Measured before the first paint, so the panel is never seen at the corner it starts in.
  useLayoutEffect(() => {
    const { offsetWidth: width, offsetHeight: height } = form.current!;
    setPosition(panelPosition(area, { width, height }, viewport));
  }, [area.x, area.y, area.width, area.height, viewport.width, viewport.height]);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (!text.trim()) return setProblem('Write a note first.');
    setBusy(true);
    setProblem('');
    setFailed(false);
    try {
      await onSend();
    } catch (error) {
      setFailed(true);
      setProblem(`Not saved: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <FeedbackOutline rect={area} chosen />
      <form
        ref={form}
        className={styles.root}
        style={position && { left: position.x, top: position.y }}
        role="dialog"
        aria-label="Feedback note"
        onSubmit={(e) => void submit(e)}
      >
        <textarea
          ref={textRef}
          value={text}
          placeholder="What should change here?"
          aria-label="Your feedback on the selected area"
          autoFocus
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
        />
        <p className={cx(styles.status, failed && styles.error)} role="status">
          {problem}
        </p>
        <div className={styles.actions}>
          <button className={styles.button} type="submit" disabled={busy}>
            Save
          </button>
          <button className={styles.button} type="button" onClick={onCancel}>
            Cancel
          </button>
          <p className={styles.hint}>⌘/Ctrl+Enter saves, Esc cancels</p>
        </div>
      </form>
    </>
  );
}

export default FeedbackPanel;
