/**
 * TonemapSelect — the five HDR-to-LDR tone-mapping algorithms, as a plain
 * `<select>` (html:296-305). Options are a fixed table rather than derived
 * from `TonemapMode`'s union so the label text stays hand-authored and
 * reviewable, matching the spike's copy exactly.
 */
import type { ReactNode } from 'react';
import type { TonemapMode } from '../../../@types/engine/TonemapMode';
import styles from './TonemapSelect.module.css';

export type TonemapSelectProps = {
  readonly value: TonemapMode;
  readonly onChange: (mode: TonemapMode) => void;
};

const OPTIONS: ReadonlyArray<{ readonly mode: TonemapMode; readonly label: string }> = [
  { mode: 0, label: 'ACES (filmic)' },
  { mode: 1, label: 'Reinhard' },
  { mode: 2, label: 'Reinhard extended' },
  { mode: 3, label: 'Uncharted 2 (filmic)' },
  { mode: 4, label: 'Linear' },
];

function TonemapSelect({ value, onChange }: TonemapSelectProps): ReactNode {
  return (
    <select
      className={styles.root}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as TonemapMode)}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.mode} value={opt.mode}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default TonemapSelect;
