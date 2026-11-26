import InspectorRow from '../../../primitives/components/InspectorRow/InspectorRow';
import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import CameraIcon from '../../../../../../src/components/icons/CameraIcon/CameraIcon';
import type { ClipTransport } from '../../../../../../src/@types/animation/ClipTransport';

type CurrentViewButtonProps = {
  readonly transport: ClipTransport;
  readonly onUse: () => void;
};

/** Writes the drawn camera into the step (one Undo); the tip says how to free a following camera. */
function CurrentViewButton({ transport, onUse }: CurrentViewButtonProps) {
  const free = transport.kind === 'paused' && transport.camera === 'free';
  return (
    <InspectorRow label="" spaced>
      <StudioTip name="Use current view" state={free ? undefined : 'Free look: drag the sky first'}>
        <Button size="compact" onClick={onUse}>
          <CameraIcon size={14} />
          Use current view
        </Button>
      </StudioTip>
    </InspectorRow>
  );
}

export default CurrentViewButton;
