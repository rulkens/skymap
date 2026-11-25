/**
 * FormField — one row of a form: the label in its parent grid's `label` column,
 * the control and one line under it in its `control` column, through subgrid.
 * That line is the error when there is one, else the help. An input takes
 * `ids.control`; a group names itself by `ids.label`; both point
 * `aria-describedby` at `ids.hint`.
 */
import { useId, type ReactNode } from 'react';
import type { FormFieldIds } from '../../../@types/FormFieldIds';
import styles from './FormField.module.css';

export type FormFieldProps = {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly children: (ids: FormFieldIds) => ReactNode;
};

function FormField({ label, hint, error, children }: FormFieldProps): ReactNode {
  const id = useId();
  const line = error ?? hint;
  const ids: FormFieldIds = {
    control: `${id}-control`,
    label: `${id}-label`,
    hint: line === undefined ? undefined : `${id}-hint`,
  };
  return (
    <div className={styles.root}>
      <label id={ids.label} htmlFor={ids.control} className={styles.label}>
        {label}
      </label>
      {children(ids)}
      {error !== undefined ? (
        <p id={ids.hint} role="alert" className={styles.error}>
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={ids.hint} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export default FormField;
