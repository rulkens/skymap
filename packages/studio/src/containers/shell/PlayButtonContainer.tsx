import { useAppSelector } from '../../../../../src/store/hooks';
import { selectClipActive } from '../../../../../src/state/camera/selectors';
import PlayButton from '../../shell/components/PlayButton/PlayButton';
import { selectTransport } from '../../session/state/selectors';
import { selectFailureLine } from '../../shell/state/selectFailureLine';
import { useStudioCommand } from './useStudioCommand';

function PlayButtonContainer() {
  const run = useStudioCommand();
  return (
    <PlayButton
      playing={useAppSelector(selectTransport).kind === 'running'}
      live={useAppSelector(selectClipActive)}
      failure={useAppSelector(selectFailureLine)}
      onPlay={() => run('play')}
    />
  );
}

export default PlayButtonContainer;
