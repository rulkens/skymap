/**
 * DebugSelectRow — one labelled dropdown row for a DebugPanel tuning section, for a setting that is
 * one of a few named modes. Reuses the slider row's classes so it lines up with range and colour rows.
 */

import type { ReactNode } from 'react';
import styles from './DebugSlider.module.css';

export type DebugSelectRowProps<V extends string> = {
  readonly label: string;
  readonly value: V;
  readonly options: readonly V[];
  readonly title?: string;
  readonly onChange: (value: V) => void;
};

function DebugSelectRow<V extends string>({
  label,
  value,
  options,
  title,
  onChange,
}: DebugSelectRowProps<V>): ReactNode {
  return (
    <label className={styles.root} title={title}>
      <span className={styles.label}>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as V)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default DebugSelectRow;
