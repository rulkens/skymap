import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import RangedNumberField from '../../../primitives/components/RangedNumberField/RangedNumberField';

type Props = {
  readonly label: string;
  /** The value the engine uses. */
  readonly value: number;
  /** The authoring default: dim at it, ↺ back to it otherwise. */
  readonly resetTo: number;
  readonly unit?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly spaced?: boolean;
  /** `gesture` is null for ↺. */
  readonly onChange: (value: number, gesture: string | null) => void;
};

/** One knob of a composite field (a Fly's curve, a zoom-pan's tuning) as a slider row. */
function SliderRow({ label, value, resetTo, unit, min, max, step, spaced, onChange }: Props) {
  const atDefault = value === resetTo;
  return (
    <InspectorRow
      label={label}
      dim={atDefault}
      spaced={spaced}
      onReset={atDefault ? undefined : () => onChange(resetTo, null)}
    >
      <RangedNumberField
        label={label}
        unit={unit}
        value={value}
        min={min}
        max={max}
        step={step}
        onCommit={onChange}
      />
    </InspectorRow>
  );
}

export default SliderRow;
