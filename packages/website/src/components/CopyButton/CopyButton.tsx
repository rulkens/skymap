/*
 * CopyButton — the one control that copies a text: the sheets icon a browser
 * shows at the end of its address field. It changes to a tick in place when
 * the text is on the clipboard, so nothing on the page moves. `label` says
 * what is copied ("Copy the address") and is the control's name.
 */
import { useEffect, useRef, useState } from 'react';

import styles from './CopyButton.module.css';

type CopyButtonProps = { text: string; label: string };

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const revert = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(revert.current), []);

  // The control changes in place instead of anything appearing, so nothing shifts; it reverts so it can be used again.
  // No clipboard on plain http, and a permission can be refused: then the label stays as it was.
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        clearTimeout(revert.current);
        revert.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  return (
    <button
      className={styles.root}
      type="button"
      data-copied={copied ? '' : undefined}
      aria-label={copied ? 'Copied' : label}
      title={label}
      onClick={copy}
    >
      <svg className={styles.sheets} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="1.5" />
        <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
      </svg>
      <svg className={styles.tick} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}

export default CopyButton;
