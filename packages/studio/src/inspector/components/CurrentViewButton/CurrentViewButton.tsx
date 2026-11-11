import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import CameraIcon from '../../../../../../src/components/icons/CameraIcon/CameraIcon';
import { selectTransport } from '../../../session/state/selectors';
import { viewUsed } from '../../../session/state/studioSlice';
import { useAppDispatch, useAppSelector } from '../../../../../../src/store/hooks';
import type { RowRef } from '../../../@types/rows/RowRef';

type Props = { readonly rowRef: RowRef };

/** Writes the drawn camera into the step (one Undo); the tip says how to free a following camera. */
function CurrentViewButton({ rowRef }: Props) {
  const dispatch = useAppDispatch();
  const transport = useAppSelector(selectTransport);
  const free = transport.kind === 'paused' && transport.camera === 'free';
  return (
    <InspectorRow label="" spaced>
      <StudioTip name="Use current view" state={free ? undefined : 'Free look: drag the sky first'}>
        <Button size="compact" onClick={() => dispatch(viewUsed(rowRef))}>
          <CameraIcon size={14} />
          Use current view
        </Button>
      </StudioTip>
    </InspectorRow>
  );
}

export default CurrentViewButton;
