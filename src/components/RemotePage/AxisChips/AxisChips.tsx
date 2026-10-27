/**
 * AxisChips — which nav gesture the trackpad's drag stands for under OpenSpace, where a touch
 * has no modifier key to choose it. Sticky single-select; the choice lives on the page only.
 */

import cx from 'classnames';
import type { RemoteNavAxis } from '../../../@types/remote/RemoteNavAxis';
import controls from '../remoteControls.module.css';
import styles from './AxisChips.module.css';

export type AxisChipsProps = {
  readonly axis: RemoteNavAxis;
  readonly onChange: (axis: RemoteNavAxis) => void;
};

const CHIPS: readonly { id: RemoteNavAxis; label: string }[] = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'look', label: 'Look' },
  { id: 'roll', label: 'Roll' },
  { id: 'zoom', label: 'Zoom' },
];

function AxisChips({ axis, onChange }: AxisChipsProps) {
  return (
    <div className={styles.root} role="radiogroup" aria-label="Drag does">
      {CHIPS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={axis === id}
          className={cx(controls.button, styles.chip, axis === id && styles.selected)}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default AxisChips;
