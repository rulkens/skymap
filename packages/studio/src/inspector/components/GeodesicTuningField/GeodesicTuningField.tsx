import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import PickField from '../../../primitives/components/PickField/PickField';
import SliderRow from '../SliderRow/SliderRow';
import { GEODESIC_EASE_OPTIONS, MS_PER_S } from './GeodesicTuningField.constants';
import { DEFAULT_GEODESIC_TUNING } from '../../../../../../src/data/camera/focusMoveDefaults';
import type { Ease } from '../../../../../../src/@types/animation/Ease';
import type { GeodesicTuning } from '../../../../../../src/@types/camera/focusMotion/GeodesicTuning';

type Props = {
  readonly value: GeodesicTuning;
  /** The step's own duration: set, the arc length no longer times the move. */
  readonly over: number | undefined;
  readonly spaced?: boolean;
  readonly onChange: (value: GeodesicTuning, label: string, gesture: string | null) => void;
};

/**
 * A zoom-pan's tuning as rows, ranges from the Focus moves debug panel. Zoom price shapes the path;
 * speed and the bounds only time it, so they show while the step's Duration is auto.
 */
function GeodesicTuningField({ value, over, spaced, onChange }: Props) {
  const set = (patch: Partial<GeodesicTuning>, label: string, gesture: string | null) =>
    onChange({ ...value, ...patch }, label, gesture);
  const defaultEase = value.ease === DEFAULT_GEODESIC_TUNING.ease;
  const seconds = (key: 'minMs' | 'maxMs', label: string) => (
    <SliderRow
      label={label}
      unit="s"
      value={value[key] / MS_PER_S}
      resetTo={DEFAULT_GEODESIC_TUNING[key] / MS_PER_S}
      min={0.1}
      max={5}
      step={0.05}
      onChange={(s, g) => set({ [key]: Math.round(s * MS_PER_S) }, label, g)}
    />
  );
  return (
    <>
      <SliderRow
        label="Zoom price"
        value={value.rho}
        resetTo={DEFAULT_GEODESIC_TUNING.rho}
        min={0.01}
        max={2}
        step={0.01}
        spaced={spaced}
        onChange={(rho, g) => set({ rho }, 'Zoom price', g)}
      />
      <InspectorRow
        label="Ease"
        dim={defaultEase}
        onReset={
          defaultEase ? undefined : () => set({ ease: DEFAULT_GEODESIC_TUNING.ease }, 'Ease', null)
        }
      >
        <PickField
          label="Ease"
          value={value.ease}
          options={GEODESIC_EASE_OPTIONS}
          onChange={(ease) => set({ ease: ease as Ease }, 'Ease', null)}
        />
      </InspectorRow>
      {over === undefined && (
        <>
          <SliderRow
            label="Path speed"
            value={value.velocity}
            resetTo={DEFAULT_GEODESIC_TUNING.velocity}
            min={1}
            max={100}
            step={1}
            onChange={(velocity, g) => set({ velocity }, 'Path speed', g)}
          />
          {seconds('minMs', 'Shortest')}
          {seconds('maxMs', 'Longest')}
        </>
      )}
    </>
  );
}

export default GeodesicTuningField;
