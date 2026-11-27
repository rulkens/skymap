/**
 * DebugSegmentedRow — one labelled one-of-n row for a DebugPanel section, for a setting with a
 * few discrete values worth seeing at once (a dropdown hides them). Native radios sharing a
 * name give the group one tab stop and arrow keys, as the workbench's `SegmentedControl`.
 */

import { useId, type ReactNode } from 'react';
import DebugInfoTip from './DebugInfoTip';
import styles from './DebugSegmentedRow.module.css';

export type DebugSegmentedRowProps<V extends number | string> = {
  readonly label: string;
  readonly value: V;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly onChange: (value: V) => void;
  readonly info?: string;
};

function DebugSegmentedRow<V extends number | string>({
  label,
  value,
  options,
  onChange,
  info,
}: DebugSegmentedRowProps<V>): ReactNode {
  const id = useId();
  return (
    <div className={styles.root}>
      <span id={id} className={styles.label}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className={styles.track}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
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
      {info !== undefined && <DebugInfoTip label={label} info={info} />}
    </div>
  );
}

export default DebugSegmentedRow;
