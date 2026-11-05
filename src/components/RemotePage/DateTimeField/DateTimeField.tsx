/**
 * DateTimeField — one native date-and-time field, read and written in UTC like the readout, and a
 * Set button. The field follows the running clock until edited; only Set (or Enter) sends, because
 * a desktop browser reports every typed part of the value as a change.
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';
import CalendarIcon from '../../icons/CalendarIcon/CalendarIcon';
import { parseDatetimeLocalUtc } from '../../../utils/time/parseDatetimeLocalUtc';
import { toDatetimeLocalUtc } from '../../../utils/time/toDatetimeLocalUtc';
import controls from '../remoteControls.module.css';
import styles from './DateTimeField.module.css';

export type DateTimeFieldProps = {
  readonly instant: Date;
  readonly onSet: (instant: Date) => void;
};

function DateTimeField({ instant, onSet }: DateTimeFieldProps): ReactNode {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? toDatetimeLocalUtc(instant);
  const set = (): void => {
    const parsed = parseDatetimeLocalUtc(value);
    if (!parsed) return;
    onSet(parsed);
    setDraft(null);
  };
  return (
    <div className={styles.root}>
      <label htmlFor={id} className={styles.label}>
        <CalendarIcon size={20} />
        Set date and time (UTC)
      </label>
      <div className={styles.row}>
        <input
          id={id}
          type="datetime-local"
          className={cx(controls.input, styles.input)}
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') set();
          }}
        />
        <button type="button" className={controls.button} onClick={set}>
          Set
        </button>
      </div>
    </div>
  );
}

export default DateTimeField;
