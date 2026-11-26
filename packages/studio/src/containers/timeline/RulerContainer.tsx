import { useAppSelector } from '../../../../../src/store/hooks';
import Ruler from '../../timeline/components/Ruler/Ruler';
import { selectPlayheadSec } from '../../session/state/selectors';
import { selectShownLoop } from '../../timeline/state/selectShownLoop';
import { useScrubTransport } from './useScrubTransport';
import type { Timeline } from '../../@types/rows/Timeline';
import type { TimeWindow } from '../../@types/session/TimeWindow';

type RulerContainerProps = {
  readonly timeline: Timeline;
  readonly window: TimeWindow;
};

/** Reads the head itself, so a played frame re-renders the ruler and not the whole pane. */
function RulerContainer({ timeline, window }: RulerContainerProps) {
  return (
    <Ruler
      timeline={timeline}
      window={window}
      playheadSec={useAppSelector(selectPlayheadSec)}
      looped={useAppSelector(selectShownLoop)}
      scrub={useScrubTransport()}
    />
  );
}

export default RulerContainer;
