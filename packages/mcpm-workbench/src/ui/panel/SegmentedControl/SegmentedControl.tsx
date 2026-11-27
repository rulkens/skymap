/**
 * SegmentedControl — one-of-n choice as a single track with the chosen segment
 * filled. Native radios sharing a name give the group one tab stop and arrow
 * keys; the caller's visible label names it through `labelledBy`.
 */
import { useId, type ReactNode } from 'react';
import styles from './SegmentedControl.module.css';

export type SegmentedControlProps<V extends string> = {
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
};

function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  labelledBy,
  describedBy,
}: SegmentedControlProps<V>): ReactNode {
  const name = useId();
  return (
    <div
      role="radiogroup"
      className={styles.root}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      {options.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            type="radio"
            className={styles.radio}
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export default SegmentedControl;
