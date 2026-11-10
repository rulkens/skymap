import { useId, useRef } from 'react';
import Slider from '../../../../../../src/components/common/Slider/Slider';
import { SLIDER_GESTURE_MS } from './RangedNumberField.constants';

type Props = {
  readonly value: number;
  readonly label: string;
  readonly unit?: string;
  readonly step: number;
  readonly min: number;
  readonly max: number;
  readonly onCommit: (value: number, gesture: string) => void;
};

/** The app's compact Slider; commits less than `SLIDER_GESTURE_MS` apart share one gesture (one history entry). */
function RangedNumberField({ value, label, unit, step, min, max, onCommit }: Props) {
  const id = useId();
  const sessions = useRef(0);
  const last = useRef({ at: -Infinity, gesture: '' });
  return (
    <Slider
      size="compact"
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      format={unit ? (v) => `${v} ${unit}` : undefined}
      onChange={(v) => {
        const now = performance.now();
        if (now - last.current.at > SLIDER_GESTURE_MS) {
          last.current.gesture = `${id}:${sessions.current++}`;
        }
        last.current.at = now;
        onCommit(v, last.current.gesture);
      }}
    />
  );
}

export default RangedNumberField;
