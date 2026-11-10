import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AUTO_TEXT } from '../../../data/autoText';
import { SHIFT_FACTOR } from './TextNumberField.constants';
import s from './TextNumberField.module.css';

type Props = {
  /** Null: unset; the field is empty and reads `auto`. */
  readonly value: number | null;
  readonly label: string;
  readonly unit?: string;
  readonly step?: number;
  readonly min?: number;
  readonly max?: number;
  /** `gesture` is the same string for every commit of one focus session (history coalesces on it). */
  readonly onCommit: (value: number, gesture: string) => void;
};

function TextNumberField({ value, label, unit, step = 1, min, max, onCommit }: Props) {
  const id = useId();
  const sessions = useRef(0);
  const gesture = useRef('');
  // undefined: not editing, the field shows `value`.
  const [text, setText] = useState<string>();
  const shown = text ?? (value === null ? '' : String(value));
  const parsed = Number(shown);
  const invalid = text !== undefined && (text.trim() === '' || !Number.isFinite(parsed));

  const commit = (v: number) => {
    onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)), gesture.current);
    setText(undefined);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!invalid) commit(parsed);
    } else if (e.key === 'Escape') {
      setText(undefined);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = step * (e.shiftKey ? SHIFT_FACTOR : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      // Steps from the shown number, so typed-but-uncommitted text is stepped from, not lost;
      // toPrecision drops the float noise of repeated 0.1 steps.
      commit(Number(((invalid ? (value ?? 0) : parsed) + delta).toPrecision(12)));
    }
  };

  return (
    <span className={s.root}>
      <input
        className={s.input}
        type="text"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={value === null ? AUTO_TEXT : undefined}
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => (gesture.current = `${id}:${sessions.current++}`)}
        onBlur={() => {
          if (text !== undefined && !invalid && parsed !== value) commit(parsed);
          else setText(undefined);
        }}
        onKeyDown={onKeyDown}
      />
      {unit && <span className={s.unit}>{unit}</span>}
    </span>
  );
}

export default TextNumberField;
