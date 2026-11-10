import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import SliderRow from '../SliderRow/SliderRow';
import { ABSENT_PASS_BY, SIDE_OPTIONS } from './PassByField.constants';
import {
  DEFAULT_PASS_BY_DIR,
  DEFAULT_PASS_BY_OFFSET,
} from '../../../../../../src/services/engine/animation/pathDefaults';
import type { PassByConfig } from '../../../../../../src/@types/animation/PassByConfig';
import type { PassByDir } from '../../../../../../src/@types/animation/PassByDir';

type Props = {
  readonly value: PassByConfig | undefined;
  readonly spaced?: boolean;
  readonly onChange: (value: PassByConfig, label: string, gesture: string | null) => void;
};

/** How far off each galaxy a Fly passes, and on which side; the side does nothing at 0. */
function PassByField({ value = ABSENT_PASS_BY, spaced, onChange }: Props) {
  const isDefaultSide = value.dir === DEFAULT_PASS_BY_DIR;
  const side = (dir: PassByDir) => onChange({ ...value, dir }, 'Side', null);
  return (
    <>
      <SliderRow
        label="Pass by"
        unit="radii"
        value={value.offset}
        resetTo={DEFAULT_PASS_BY_OFFSET}
        min={0}
        max={16}
        step={0.5}
        spaced={spaced}
        onChange={(offset, g) => onChange({ ...value, offset }, 'Pass by', g)}
      />
      {value.offset > 0 && (
        <InspectorRow
          label="Side"
          dim={isDefaultSide}
          onReset={isDefaultSide ? undefined : () => side(DEFAULT_PASS_BY_DIR)}
        >
          <SegmentedField
            label="Side"
            value={value.dir}
            options={SIDE_OPTIONS}
            onChange={(dir) => side(dir as PassByDir)}
          />
        </InspectorRow>
      )}
    </>
  );
}

export default PassByField;
