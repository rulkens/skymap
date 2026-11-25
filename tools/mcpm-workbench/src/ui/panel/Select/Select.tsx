/**
 * Select — the workbench's one dropdown: a native `<select>` over a fixed list of
 * options, a customizable select (`appearance: base-select`) where the browser has
 * it, a plain one without icons elsewhere. Named by PanelRow's `<label>` or `aria-label`.
 * React 19.2 rejects elements inside `<select>` other than `<option>`, and inside
 * `<option>` other than text (a dev console error, which fails the GPU probe), so the
 * select's `<button>` and each option's icon slot are made here and filled through
 * portals. The button draws the chosen option from `value` over hidden copies of every
 * option, so the control is as wide as its longest option whatever is chosen.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Select.module.css';

export type SelectProps<T extends string> = {
  readonly value: T;
  readonly options: readonly T[];
  readonly onChange: (value: T) => void;
  /** Shown instead of the option's value. */
  readonly labels?: Readonly<Record<T, string>>;
  /** Drawn before each option's label, in the picker and on the closed control. */
  readonly icons?: Readonly<Record<T, ReactNode>>;
  /** Icons in the picker only: the closed control stays as wide as its names, the
   *  control column every sidebar row shares. */
  readonly pickerOnlyIcons?: boolean;
  readonly 'aria-label'?: string;
};

function Select<T extends string>({
  value,
  options,
  onChange,
  labels,
  icons,
  pickerOnlyIcons = false,
  'aria-label': ariaLabel,
}: SelectProps<T>): ReactNode {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [iconSlots, setIconSlots] = useState<readonly HTMLElement[]>([]);
  const hasIcons = icons !== undefined;

  useLayoutEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const created = document.createElement('button');
    select.prepend(created);
    const slots = hasIcons
      ? Array.from(select.options, (option) => {
          const slot = document.createElement('span');
          option.prepend(slot);
          return slot;
        })
      : [];
    setButton(created);
    setIconSlots(slots);
    return () => {
      created.remove();
      for (const slot of slots) slot.remove();
    };
  }, [options, hasIcons]);

  const content = (option: T): ReactNode => (
    <>
      {icons && !pickerOnlyIcons && <span className={styles.icon}>{icons[option]}</span>}
      {labels?.[option] ?? option}
    </>
  );

  return (
    <>
      <select
        ref={selectRef}
        className={styles.root}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
      {button &&
        createPortal(
          <>
            <span className={styles.face}>{content(value)}</span>
            {options.map((option) => (
              <span key={option} className={styles.sizer}>
                {content(option)}
              </span>
            ))}
          </>,
          button,
        )}
      {icons && iconSlots.map((slot, i) => createPortal(icons[options[i]!], slot, options[i]))}
    </>
  );
}

export default Select;
