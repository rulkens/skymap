/*
 * CopyButton — the one control that copies a text: the sheets icon a browser
 * shows at the end of its address field. It is markup only: the text rides on
 * the button (`data-copy`) and CopyListener, once on the page, copies it and
 * changes the control to a tick in place, so nothing on the page moves. A
 * button may stand deep inside a component that is rendered at build time and
 * has no island of its own, which is why it does not hold its own state.
 * `label` says what is copied ("Copy the address") and is the control's name.
 */
import styles from './CopyButton.module.css';

type CopyButtonProps = { text: string; label: string };

function CopyButton({ text, label }: CopyButtonProps) {
  return (
    <button className={styles.root} type="button" data-copy={text} aria-label={label} title={label}>
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
