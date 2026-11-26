/**
 * useSliderTextEdit — Slider's typed-value mode: Enter commits, Escape cancels,
 * blur commits a valid value and drops an invalid one.
 *
 * The glow (`aria-invalid` and its `reason`) waits for a failed Enter, then tracks the text: shown
 * live it would flash on every legitimate prefix of an in-range value ("1" on the
 * way to "128" when min is 64). A commit snaps to `step`, because integer-stepped
 * consumers (bounces, divisors, whole-pixel sizes) cannot take fractions. With
 * `displayed`, text is in shown units; range and snap still apply to the stored value.
 */

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { SliderDisplayed } from '../../../@types/components/SliderDisplayed';
import type { SliderTextEdit } from '../../../@types/components/SliderTextEdit';
import { checkTypedValue } from '../../../utils/input/checkTypedValue';
import { typedValueReason } from '../../../utils/input/typedValueReason';
import { snapToStep } from '../../../utils/math/snapToStep';

export function useSliderTextEdit({
  value,
  min,
  max,
  step,
  onChange,
  displayed,
  sliderRef,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
  readonly displayed: SliderDisplayed | undefined;
  readonly sliderRef: RefObject<HTMLElement | null>;
}): SliderTextEdit {
  const inputRef = useRef<HTMLInputElement>(null);
  // Refs, not state: the box unmounting can fire one more blur after Enter/Escape
  // already finished, and the focus hand-back must run after the pill re-renders.
  const openRef = useRef(false);
  const refocusRef = useRef(false);
  const prefillRef = useRef('');
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [attempted, setAttempted] = useState(false);
  const check = checkTypedValue(text, min, max, displayed);
  const reason = editing && attempted ? typedValueReason(check, min, max, displayed) : undefined;

  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (refocusRef.current) {
      refocusRef.current = false;
      sliderRef.current?.focus();
    }
  }, [editing, sliderRef]);

  const finish = (commit: boolean, refocus: boolean) => {
    if (!openRef.current) return;
    openRef.current = false;
    // Untouched text is never sent: a shown number need not convert back to the exact
    // stored one, and an off-grid value (an imported box size) must survive Enter unsnapped.
    if (commit && check.kind === 'valid' && text !== prefillRef.current && check.value !== value) {
      const next = snapToStep(check.value, min, max, step);
      if (next !== value) onChange(next);
    }
    refocusRef.current = refocus;
    setEditing(false);
  };

  return {
    editing,
    reason,
    start: () => {
      openRef.current = true;
      // String() is the shortest text that parses back to the same double, so no digit the format rounds away is lost.
      prefillRef.current = String(displayed ? displayed.fromValue(value) : value);
      setText(prefillRef.current);
      setAttempted(false);
      setEditing(true);
    },
    input: {
      ref: inputRef,
      value: text,
      'aria-invalid': reason ? true : undefined,
      onChange: (e) => setText(e.target.value),
      onKeyDown: (e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') finish(false, true);
        else if (check.kind === 'valid') finish(true, true);
        else setAttempted(true);
      },
      onBlur: () => finish(true, false),
    },
  };
}
