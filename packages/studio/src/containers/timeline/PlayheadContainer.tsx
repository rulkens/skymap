import { useAppSelector } from '../../../../../src/store/hooks';
import Playhead from '../../timeline/components/Playhead/Playhead';
import { selectPlayheadSec } from '../../session/state/selectors';
import type { TimeWindow } from '../../@types/session/TimeWindow';

type PlayheadContainerProps = { readonly window: TimeWindow };

/** Reads the head itself, so a played frame re-renders the line and not the whole pane. */
function PlayheadContainer({ window }: PlayheadContainerProps) {
  return <Playhead window={window} playheadSec={useAppSelector(selectPlayheadSec)} />;
}

export default PlayheadContainer;
