import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { SHIFT_FACTOR } from './NumberField.constants';
import s from './NumberField.module.css';

type Props = {
  readonly value: number;
  readonly label: string;
  readonly step?: number;
  readonly min?: number;
  /** `gesture` is the same string for every commit of one focus session (history coalesces on it). */
  readonly onCommit: (value: number, gesture: string) => void;
};

function TextNumberField({ value, label, step = 1, min, onCommit }: Props) {
  const id = useId();
  const sessions = useRef(0);
  const gesture = useRef('');
  // undefined: not editing, the field shows `value`.
  const [text, setText] = useState<string>();
  const shown = text ?? String(value);
  const parsed = Number(shown);
  const invalid = text !== undefined && (text.trim() === '' || !Number.isFinite(parsed));

  const commit = (v: number) => {
    onCommit(min === undefined ? v : Math.max(min, v), gesture.current);
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
      commit(Number(((invalid ? value : parsed) + delta).toPrecision(12)));
    }
  };

  return (
    <input
      className={s.root}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => (gesture.current = `${id}:${sessions.current++}`)}
      onBlur={() => {
        if (text !== undefined && !invalid && parsed !== value) commit(parsed);
        else setText(undefined);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

export default TextNumberField;
