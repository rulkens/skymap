import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import SliderRow from '../SliderRow/SliderRow';
import { ABSENT_SPLINE, CURVE_OPTIONS } from './SplineField.constants';
import {
  DEFAULT_LOOK_AHEAD,
  DEFAULT_SPLINE_CONFIG,
  DEFAULT_TURN_DELAY,
} from '../../../../../../src/services/engine/animation/pathDefaults';
import type { SplineConfig } from '../../../../../../src/@types/animation/SplineConfig';

type Props = {
  readonly value: SplineConfig | undefined;
  readonly spaced?: boolean;
  readonly onChange: (value: SplineConfig, label: string, gesture: string | null) => void;
};

/** A Fly's curve as rows: the curve, and the two knobs only Head-on has. Ranges from the Clip path debug panel. */
function SplineField({ value = ABSENT_SPLINE, spaced, onChange }: Props) {
  const isDefault = value.kind === DEFAULT_SPLINE_CONFIG.kind;
  return (
    <>
      <InspectorRow
        label="Curve"
        dim={isDefault}
        spaced={spaced}
        onReset={isDefault ? undefined : () => onChange(DEFAULT_SPLINE_CONFIG, 'Curve', null)}
      >
        <SegmentedField
          label="Curve"
          value={value.kind}
          options={CURVE_OPTIONS}
          onChange={(kind) =>
            onChange(kind === 'centripetal' ? ABSENT_SPLINE : DEFAULT_SPLINE_CONFIG, 'Curve', null)
          }
        />
      </InspectorRow>
      {value.kind === 'causalHermite' && (
        <>
          <SliderRow
            label="Overshoot"
            unit="×"
            value={value.turnDelay ?? DEFAULT_TURN_DELAY}
            resetTo={DEFAULT_TURN_DELAY}
            min={0}
            max={3}
            step={0.05}
            onChange={(turnDelay, g) => onChange({ ...value, turnDelay }, 'Overshoot', g)}
          />
          <SliderRow
            label="Look ahead"
            unit="s"
            value={value.lookAhead ?? DEFAULT_LOOK_AHEAD}
            resetTo={DEFAULT_LOOK_AHEAD}
            min={0}
            max={6}
            step={0.1}
            onChange={(lookAhead, g) => onChange({ ...value, lookAhead }, 'Look ahead', g)}
          />
        </>
      )}
    </>
  );
}

export default SplineField;
