import RangedNumberField from '../RangedNumberField/RangedNumberField';
import TextNumberField from '../TextNumberField/TextNumberField';

type Props = {
  readonly value: number;
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

function NumberField({ min, max, step = 1, ...rest }: Props) {
  return min !== undefined && max !== undefined ? (
    <RangedNumberField {...rest} step={step} min={min} max={max} />
  ) : (
    <TextNumberField {...rest} step={step} min={min} />
  );
}

export default NumberField;
