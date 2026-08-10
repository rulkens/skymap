// src/components/common/CopyButton/CopyButton.tsx
/**
 * CopyButton — a button that copies `text` to the clipboard on click and
 * shows transient success/failure feedback in place of its label.
 *
 * Domain-agnostic on purpose (DebugPanel's Milky-Way and flow-field tuning
 * sections both use it): `text` + `label` is the whole surface, `title` a
 * plain passthrough for a consumer-specific hint. Disabled whenever `text`
 * is empty — pasting nothing is never useful — so callers don't have to
 * compute a redundant `disabled` prop from the same fact.
 *
 * Renders through the shared `Button` primitive for chrome; this component
 * owns only the clipboard call and the feedback timer, not pixels.
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
