import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Button from '../../../../../../src/components/common/Button/Button';
import PlayIcon from '../../../../../../src/components/icons/PlayIcon/PlayIcon';
import PauseIcon from '../../../../../../src/components/icons/PauseIcon/PauseIcon';

type PlayButtonProps = {
  readonly playing: boolean;
  /** The preview has started. */
  readonly live: boolean;
  /** Why the current revision cannot play; null while it resolves or once it compiles. */
  readonly failure: string | null;
  readonly onPlay: () => void;
};

/** Play / Pause, in the top bar and on the narrow notice (Q13). Waits for the preview to start. */
function PlayButton({ playing, live, failure, onPlay }: PlayButtonProps) {
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
        onClick={onPlay}
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </Button>
    </StudioTip>
  );
}

export default PlayButton;
