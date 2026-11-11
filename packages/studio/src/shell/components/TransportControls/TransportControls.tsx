import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import LoopIcon from '../../../../../../src/components/icons/LoopIcon/LoopIcon';
import PlayButton from '../PlayButton/PlayButton';
import { selectLoop, selectTransport } from '../../../session/state/selectors';
import { selectSelectedRow } from '../../../timeline/state/selectSelectedRow';
import { useStudioCommand } from '../../hooks/useStudioCommand';
import { useAppSelector } from '../../../../../../src/store/hooks';
import s from './TransportControls.module.css';

/** Play, Loop and, while the camera is free, the way back to following the playhead (Q29). */
function TransportControls() {
  const run = useStudioCommand();
  const loop = useAppSelector(selectLoop);
  const transport = useAppSelector(selectTransport);
  const selected = useAppSelector(selectSelectedRow);
  const free = transport.kind === 'paused' && transport.camera === 'free';
  return (
    <div className={s.root} role="group" aria-label="Transport">
      <PlayButton />
      {/* The span is read at the press (Q-I), so the tip says what a press would loop. */}
      <StudioTip name="Loop" keys={['L']} state={selected === null ? 'whole clip' : 'selection'}>
        <Button size="compact" aria-label="Loop" aria-pressed={loop} onClick={() => run('loop')}>
          <LoopIcon size={16} />
        </Button>
      </StudioTip>
      {free && (
        <span className={s.free} role="status">
          Free look
          <StudioTip name="Follow the playhead" keys={['F']}>
            <Button size="compact" variant="quiet" onClick={() => run('follow')}>
              Follow
            </Button>
          </StudioTip>
        </span>
      )}
    </div>
  );
}

export default TransportControls;
