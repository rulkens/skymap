import { useState, type CSSProperties } from 'react';
import cx from 'classnames';
import type { LayerOption } from '../../../@types/kinds/LayerOption';
import s from './LayerPickField.module.css';

type Props = {
  readonly label: string;
  /** What the closed field reads: the picked names as one list. */
  readonly summary: string;
  readonly value: readonly string[];
  readonly options: readonly LayerOption[];
  readonly onChange: (value: string[]) => void;
};

/**
 * A multi-pick that opens in place, not as a popover, so the inspector's scroll never clips it.
 * The picks keep the options' order, and the last one stays checked: a step needs a layer to act on.
 */
function LayerPickField({ label, summary, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = (address: string, on: boolean) =>
    onChange(options.map((o) => o.address).filter((a) => (a === address ? on : value.includes(a))));

  return (
    <span className={s.root}>
      <button
        type="button"
        className={s.summary}
        aria-label={`${label}: ${summary}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={s.text}>{summary}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <fieldset className={s.list} aria-label={label}>
          {options.map((o) => {
            const checked = value.includes(o.address);
            return (
              <label
                key={o.address}
                className={cx(s.option, o.depth === 1 && s.item)}
                style={{ '--d': o.depth } as CSSProperties}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && value.length === 1}
                  onChange={(e) => toggle(o.address, e.target.checked)}
                />
                {o.text}
              </label>
            );
          })}
        </fieldset>
      )}
    </span>
  );
}

export default LayerPickField;
