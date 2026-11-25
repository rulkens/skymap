/**
 * AutoFitField — the load dialog's Auto fit switch, on the form's label and
 * control tracks. A narrow dialog keeps the label beside the switch rather
 * than above it, as the other fields have theirs.
 */
import { useId, type ReactNode } from 'react';
import styles from './AutoFitField.module.css';

export type AutoFitFieldProps = {
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
};

function AutoFitField({ on, onChange }: AutoFitFieldProps): ReactNode {
  const id = useId();
  return (
    <div className={styles.root}>
      <label htmlFor={id} className={styles.label}>
        Auto fit
      </label>
      <input
        id={id}
        type="checkbox"
        className={styles.toggle}
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export default AutoFitField;
