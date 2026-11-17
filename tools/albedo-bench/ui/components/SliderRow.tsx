/** SliderRow — one labelled range input with its value shown to 3 decimals. */
import { useId } from 'react';

export type SliderRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

export function SliderRow(props: SliderRowProps) {
  const id = useId();
  return (
    <div className="ctl">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{props.value.toFixed(3)}</output>
    </div>
  );
}
