import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import LoopIcon from '../../../../../../src/components/icons/LoopIcon/LoopIcon';
import PlayButtonContainer from '../../../containers/shell/PlayButtonContainer';
import type { ClipTransport } from '../../../../../../src/@types/animation/ClipTransport';
import s from './TransportControls.module.css';

type TransportControlsProps = {
  readonly loop: boolean;
  readonly transport: ClipTransport;
  readonly hasSelection: boolean;
  readonly onLoop: () => void;
  readonly onFollow: () => void;
};

/** Play, Loop and, while the camera is free, the way back to following the playhead (Q29). */
function TransportControls({
  loop,
  transport,
  hasSelection,
  onLoop,
  onFollow,
}: TransportControlsProps) {
  const free = transport.kind === 'paused' && transport.camera === 'free';
  return (
    <div className={s.root} role="group" aria-label="Transport">
      <PlayButtonContainer />
      {/* The span is read at the press (Q-I), so the tip says what a press would loop. */}
      <StudioTip name="Loop" keys={['L']} state={hasSelection ? 'selection' : 'whole clip'}>
        <Button size="compact" aria-label="Loop" aria-pressed={loop} onClick={onLoop}>
          <LoopIcon size={16} />
        </Button>
      </StudioTip>
      {free && (
        <span className={s.free} role="status">
          Free look
          <StudioTip name="Follow the playhead" keys={['F']}>
            <Button size="compact" variant="quiet" onClick={onFollow}>
              Follow
            </Button>
          </StudioTip>
        </span>
      )}
    </div>
  );
}

export default TransportControls;
