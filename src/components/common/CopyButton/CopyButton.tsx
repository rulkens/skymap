// src/components/common/CopyButton/CopyButton.tsx
/**
 * CopyButton — a button that copies `text` to the clipboard on click and
 * shows transient success/failure feedback in place of its label.
 *
 * Generic on purpose: the first consumer is the DebugPanel's "Milky Way
 * tuning" section (copying a paste-ready diff for `MILKY_WAY_TUNING_DEFAULTS`),
 * but the flow-field tuning section has the same shape of need, and nothing
 * about "write a string to the clipboard, then say whether it worked" is
 * Milky-Way-specific. `text` + `label` is the whole domain-agnostic surface;
 * `title` is a plain passthrough for a consumer-specific hint (e.g. *where*
 * the copied text is meant to be pasted), which this component has no way to
 * know on its own.
 *
 * Disabled whenever `text` is empty: clicking would put an empty string on
 * the clipboard, which is never a useful action for any consumer — not just
 * the "nothing changed this tuning session" case that motivated the button.
 * That reads as the button correctly, without needing a separate `disabled`
 * prop the caller would have to compute redundantly from the same fact.
 *
 * Renders through the shared `Button` primitive for chrome (border, hover,
 * disabled treatment); this component owns only the clipboard call and the
 * feedback timer, not pixels.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import cx from 'classnames';
import Button from '../Button/Button';
import styles from './CopyButton.module.css';

const FEEDBACK_CLEAR_MS = 1600;

export type CopyButtonProps = {
  /** The text copied to the clipboard on click. Empty disables the button. */
  readonly text: string;
  /** Idle label, shown whenever no feedback is active. */
  readonly label: string;
  /** Passed through to the underlying `<button title>` — consumer-specific. */
  readonly title?: string;
  /** Composed onto the underlying `Button` for LAYOUT only — chrome stays the primitive's. */
  readonly className?: string;
};

function CopyButton({ text, label, title, className }: CopyButtonProps): ReactNode {
  const [feedback, setFeedback] = useState<string | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The DebugPanel section this lives in gets toggled open and closed
  // freely, so a feedback timer that outlives the component is a real
  // "setState after unmount" warning, not a hypothetical — clear it here.
  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const handleClick = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('copied ✓');
    } catch {
      setFeedback('failed');
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_CLEAR_MS);
  };

  return (
    <Button
      className={cx(styles.root, className)}
      disabled={text.length === 0}
      title={title}
      onClick={() => void handleClick()}
    >
      {feedback ?? label}
    </Button>
  );
}

export default CopyButton;
