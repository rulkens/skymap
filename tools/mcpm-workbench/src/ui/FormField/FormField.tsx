/**
 * FormField — one row of a form: the label in its parent grid's `label` column,
 * the control and one line under it in its `control` column, through subgrid.
 * The line shows the error when there is one, else a warning, else the help,
 * and keeps the height of the tallest help it can show, so swapping helps never
 * moves the rows below; a warning, longer, grows the line in. An inactive row keeps its place, dimmed and `inert`. An input takes
 * `ids.control`; a group names itself by `ids.label`; both point
 * `aria-describedby` at `ids.hint`.
 */
import cx from 'classnames';
import { useId, type ReactNode } from 'react';
import type { FormFieldIds } from '../../../@types/FormFieldIds';
import styles from './FormField.module.css';

export type FormFieldProps = {
  readonly label: string;
  /** The help shown now; one of `hints`. */
  readonly hint?: string;
  /** Every help text this row can show; the line is as tall as the tallest. */
  readonly hints?: readonly string[];
  readonly error?: string;
  /** In the help's place; `stale` dims it while the settings it was found under change. */
  readonly warning?: { readonly message: string; readonly stale: boolean };
  /** The row can show an error, so a line is kept even without help. */
  readonly validated?: boolean;
  readonly inactive?: boolean;
  readonly children: (ids: FormFieldIds) => ReactNode;
};

function FormField({
  label,
  hint,
  hints = hint === undefined ? [] : [hint],
  error,
  warning,
  validated = false,
  inactive = false,
  children,
}: FormFieldProps): ReactNode {
  const id = useId();
  const hasLine = hints.length > 0 || validated;
  const ids: FormFieldIds = {
    control: `${id}-control`,
    label: `${id}-label`,
    hint: hasLine ? `${id}-hint` : undefined,
  };
  return (
    <div className={cx(styles.root, inactive && styles.inactive)} inert={inactive}>
      <label id={ids.label} htmlFor={ids.control} className={styles.label}>
        {label}
      </label>
      {children(ids)}
      {hasLine && (
        <div id={ids.hint} className={styles.line}>
          {hints.map((text) => {
            const shown = text === hint && error === undefined && warning === undefined;
            return (
              <p key={text} className={styles.hint} data-shown={shown} aria-hidden={!shown}>
                {text}
              </p>
            );
          })}
          {error !== undefined ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : (
            warning !== undefined && (
              <p role="status" className={styles.warning} data-stale={warning.stale}>
                {warning.message}
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default FormField;
