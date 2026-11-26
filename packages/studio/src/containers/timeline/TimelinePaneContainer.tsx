import { useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../../src/store/hooks';
import TimelinePane from '../../timeline/components/TimelinePane/TimelinePane';
import { playheadSet, rowSelected, rowToggled } from '../../session/state/studioSlice';
import { selectPlayheadSec, selectViewport } from '../../session/state/selectors';
import { selectSelectionStandInId } from '../../timeline/state/selectSelectionStandInId';
import { selectTimeline } from '../../timeline/state/selectTimeline';
import { useObjectIndex } from '../session/useObjectIndex';
import { useTimelineWheel } from './useTimelineWheel';

function TimelinePaneContainer() {
  const dispatch = useAppDispatch();
  const timeline = useAppSelector(selectTimeline);
  const standIn = useAppSelector(selectSelectionStandInId);
  const viewport = useAppSelector(selectViewport);
  const playheadSec = useAppSelector(selectPlayheadSec);
  const objects = useObjectIndex();
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useTimelineWheel(root, track, timeline !== null);
  if (timeline === null) return null;

  return (
    <TimelinePane
      timeline={timeline}
      standIn={standIn}
      viewport={viewport}
      playheadSec={playheadSec}
      objects={objects}
      rootRef={root}
      trackRef={track}
      onSelectRow={(ref) => dispatch(rowSelected(ref))}
      onToggleRow={(id) => dispatch(rowToggled(id))}
      onSeek={(sec) => dispatch(playheadSet(sec))}
    />
  );
}

export default TimelinePaneContainer;
