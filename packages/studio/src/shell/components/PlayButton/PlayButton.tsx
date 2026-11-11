import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import PlayIcon from '../../../../../../src/components/icons/PlayIcon/PlayIcon';
import PauseIcon from '../../../../../../src/components/icons/PauseIcon/PauseIcon';
import { selectTransport } from '../../../session/state/selectors';
import { selectFailureLine } from '../../state/selectFailureLine';
import { selectClipActive } from '../../../../../../src/state/camera/selectors';
import { useStudioCommand } from '../../hooks/useStudioCommand';
import { useAppSelector } from '../../../../../../src/store/hooks';

/** Play / Pause, in the top bar and on the narrow notice (Q13). Waits for the preview to start. */
function PlayButton() {
  const run = useStudioCommand();
  const playing = useAppSelector(selectTransport).kind === 'running';
  const live = useAppSelector(selectClipActive);
  const failure = useAppSelector(selectFailureLine);
  return (
    <StudioTip
      name={playing ? 'Pause' : 'Play'}
      keys={['Space']}
      state={live ? undefined : (failure ?? 'Resolving subjects')}
    >
      <Button
        size="compact"
        aria-label="Play"
        aria-pressed={playing}
        disabled={!live}
        onClick={() => run('play')}
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </Button>
    </StudioTip>
  );
}

export default PlayButton;
