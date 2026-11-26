import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import { START_MODE_OPTIONS } from './StartModeField.constants';
import type { ClipData } from '../../../../../../src/@types/animation/ClipData';

type StartModeFieldProps = {
  readonly start: ClipData['start'];
  readonly onChange: (mode: 'saved' | 'live') => void;
};

/** Saved starts every play from the pose below; Live starts wherever the camera is when the clip plays. */
function StartModeField({ start, onChange }: StartModeFieldProps) {
  return (
    <InspectorRow label="View">
      <SegmentedField
        label="View"
        value={typeof start === 'object' ? 'saved' : 'live'}
        options={START_MODE_OPTIONS}
        onChange={(mode) => onChange(mode as 'saved' | 'live')}
      />
    </InspectorRow>
  );
}

export default StartModeField;
