/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant in,
 * `setSimDays` out. The instant is re-derived on a 4 Hz interval, the way the TimeBar's
 * readout is, so a running clock re-renders this leaf and not the whole exhibit overlay.
 * `setSimDays` leaves rate and pause alone, so a seek never stops or starts the clock.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitOverlay/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectTimeState } from '../../state/time/selectors';
import { setSimDays } from '../../state/time/timeSlice';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { timelineLanes } from '../../utils/exhibits/timeline/timelineLanes';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';

const REFRESH_MS = 250;

export type ExhibitTimelineContainerProps = {
  readonly section: ExhibitTimelineSection;
};

function ExhibitTimelineContainer({ section }: ExhibitTimelineContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const lanes = useMemo(() => timelineLanes(section.events), [section.events]);
  // The axis ends at the wall clock as the exhibit opened; it does not creep.
  const endMs = useMemo(() => Date.now(), []);

  const [simDays, setDays] = useState(() => deriveSimDays(time, performance.now()));
  useEffect(() => {
    const update = () => setDays(deriveSimDays(time, performance.now()));
    update();
    const id = setInterval(update, REFRESH_MS);
    return () => clearInterval(id);
  }, [time]);

  const onSeek = useCallback(
    (days: number) => dispatch(setSimDays({ simDays: days, nowMs: performance.now() })),
    [dispatch],
  );

  return (
    <ExhibitTimeline
      section={section}
      lanes={lanes}
      simDays={simDays}
      endMs={endMs}
      onSeek={onSeek}
    />
  );
}

export default memo(ExhibitTimelineContainer);
