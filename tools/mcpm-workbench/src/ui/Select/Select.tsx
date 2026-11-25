/**
 * Select — the workbench's one dropdown: a native `<select>` over a fixed list
 * of string options, so the tier and palette rows are the same control. Its
 * accessible name comes from the row's wrapping `<label>` (PanelRow).
 */
import type { ReactNode } from 'react';
import styles from './Select.module.css';

export type SelectProps<T extends string> = {
  readonly value: T;
  readonly options: readonly T[];
  readonly onChange: (value: T) => void;
};

function Select<T extends string>({ value, options, onChange }: SelectProps<T>): ReactNode {
  return (
    <select className={styles.root} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export default Select;
