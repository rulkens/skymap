/*
 * NoteField — a labelled textarea with a Save button that says what it saves. It saves on blur or
 * Enter and drops the edit on Escape; while the owner types, the stored value does not overwrite it.
 */
import { useRef, useState } from 'react';

import styles from './NoteField.module.css';

type NoteFieldProps = {
  /** Shown above the field; without one, `ariaLabel` names it. */
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  saveLabel: string;
  /** The stored value. */
  value: string;
  disabled?: boolean;
  onSave: (value: string) => void;
};

function NoteField({
  label,
  ariaLabel,
  placeholder,
  saveLabel,
  value,
  disabled,
  onSave,
}: NoteFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const dropping = useRef(false);

  const commit = () => {
    const edited = draft?.trim();
    setDraft(null);
    if (!dropping.current && edited !== undefined && edited !== value) onSave(edited);
    dropping.current = false;
  };

  return (
    <div className={styles.root}>
      {label && <div>{label}</div>}
      <textarea
        className={styles.area}
        rows={1}
        value={draft ?? value}
        placeholder={placeholder}
        aria-label={label ?? ariaLabel}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            dropping.current = true;
            e.currentTarget.blur();
          }
        }}
      />
      <button className={styles.save} type="button" disabled={disabled} onClick={commit}>
        {saveLabel}
      </button>
    </div>
  );
}

export default NoteField;
