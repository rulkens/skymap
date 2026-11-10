import RangedNumberField from '../RangedNumberField/RangedNumberField';
import TextNumberField from '../TextNumberField/TextNumberField';

type Props = {
  /** Null: unset, the engine decides; the field reads `auto` until a number is typed. */
  readonly value: number | null;
  readonly label: string;
  readonly step?: number;
  /** Shown inside the field, right beside the value. */
  readonly unit?: string;
  readonly min?: number;
  /** With `min`, a slider; unbounded values stay a text input. */
  readonly max?: number;
  /** `gesture` is the same string for every commit of one gesture (history coalesces on it). */
  readonly onCommit: (value: number, gesture: string) => void;
};

function NumberField({ value, min, max, step = 1, ...rest }: Props) {
  // A slider always shows a value, so an unset one is typed in first.
  return min !== undefined && max !== undefined && value !== null ? (
    <RangedNumberField {...rest} value={value} step={step} min={min} max={max} />
  ) : (
    <TextNumberField {...rest} value={value} step={step} min={min} max={max} />
  );
}

export default NumberField;
