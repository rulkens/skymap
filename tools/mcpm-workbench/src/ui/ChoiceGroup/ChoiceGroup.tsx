/**
 * ChoiceGroup — one-of-n radio options as labelled chips, the hint for the
 * chosen one under them, and any fields that belong to the choice below that.
 */
import { useId, type ReactNode } from 'react';
import styles from './ChoiceGroup.module.css';

export type ChoiceGroupProps<V extends string> = {
  readonly legend: string;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly hint: string;
  readonly children?: ReactNode;
};

function ChoiceGroup<V extends string>({
  legend,
  options,
  value,
  onChange,
  hint,
  children,
}: ChoiceGroupProps<V>): ReactNode {
  const id = useId();
  return (
    <fieldset className={styles.root} aria-describedby={`${id}-hint`}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              className={styles.radio}
              name={id}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className={styles.hint}>
        {hint}
      </p>
      {children}
    </fieldset>
  );
}

export default ChoiceGroup;
