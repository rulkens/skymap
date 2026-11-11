import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import SegmentedField from '../../../primitives/components/SegmentedField/SegmentedField';
import { startModeSet } from '../../../session/state/studioSlice';
import { START_MODE_OPTIONS } from './StartModeField.constants';
import { useAppDispatch } from '../../../../../../src/store/hooks';
import type { ClipData } from '../../../../../../src/@types/animation/ClipData';

type Props = { readonly start: ClipData['start'] };

/** Saved starts every play from the pose below; Live starts wherever the camera is when the clip plays. */
function StartModeField({ start }: Props) {
  const dispatch = useAppDispatch();
  return (
    <InspectorRow label="View">
      <SegmentedField
        label="View"
        value={typeof start === 'object' ? 'saved' : 'live'}
        options={START_MODE_OPTIONS}
        onChange={(mode) => dispatch(startModeSet(mode as 'saved' | 'live'))}
      />
    </InspectorRow>
  );
}

export default StartModeField;
