/*
 * ApplyConfirm — the line that asks before an apply: what it will do, then Confirm and Cancel. Mounted
 * while asking; focus lands on Cancel when there is nothing to apply, else on Confirm, and goes back to
 * the button that asked (`returnTo`) when it closes. Escape cancels.
 */
import { useEffect, useRef, type RefObject } from 'react';

import { cx } from '../../../utils/cx.ts';
import { useDevOverlayEscape } from '../../overlay/useDevOverlayEscape';
import styles from './ApplyConfirm.module.css';

type ApplyConfirmProps = {
  consequence: { text: string; nothing: boolean };
  returnTo: RefObject<HTMLElement | null>;
  /** The consequence takes a line of its own, above the buttons. */
  stacked?: boolean;
  className?: string;
  onApply: () => void;
  onClose: () => void;
};

function ApplyConfirm({
  consequence,
  returnTo,
  stacked,
  className,
  onApply,
  onClose,
}: ApplyConfirmProps) {
  const yes = useRef<HTMLButtonElement>(null);
  const no = useRef<HTMLButtonElement>(null);

  useEffect(() => (consequence.nothing ? no : yes).current?.focus(), [consequence.nothing]);

  const close = () => {
    onClose();
    returnTo.current?.focus();
  };
  useDevOverlayEscape(() => {
    close();
    return true;
  });

  return (
    <div className={cx(styles.root, stacked && styles.stacked, className)}>
      <span className={styles.consequence} role="status">
        {consequence.text}
      </span>
      {!consequence.nothing && (
        <button
          ref={yes}
          className={styles.button}
          type="button"
          onClick={() => {
            close();
            onApply();
          }}
        >
          Confirm
        </button>
      )}
      <button ref={no} className={styles.button} type="button" onClick={close}>
        Cancel
      </button>
    </div>
  );
}

export default ApplyConfirm;
