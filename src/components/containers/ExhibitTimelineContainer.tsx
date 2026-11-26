/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant, paused
 * flag, timeline profile and selected craft in; `setSimDays` (scrub), `stepToEvent`,
 * `setTimelineLane`, `playTimeline`, `stepTimelineSpeed` and `pause` out (the craft tabs ARE the
 * store's craft, so the 3D view dims the other craft). The instant and the profile's live
 * speed are re-derived on a 4 Hz interval, as the TimeBar's readout is, so a running clock
 * re-renders this leaf and not the whole exhibit overlay.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitTimeline/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { playTimeline } from '../../state/exhibits/timeline/playTimeline';
import { selectTimeState } from '../../state/time/selectors';
import { selectTimelineLane, selectTimelineSpeed } from '../../state/settings/selectors';
import { setTimelineLane, stepTimelineSpeed } from '../../state/settings/core/timelineSlice';
import { pause, setSimDays, stepToEvent } from '../../state/time/timeSlice';
import { TIMELINE_SPEEDS } from '../../data/exhibits/timeline/timelineSpeeds';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatTimelineSpeed } from '../../utils/exhibits/timeline/formatTimelineSpeed';
import { formatSimRate } from '../../utils/time/formatSimRate';
import { clockProfileRate } from '../../utils/time/clockProfileRate';
import { timelineEventStepMs } from '../../utils/exhibits/timeline/timelineEventStepMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { timelineLanes } from '../../utils/exhibits/timeline/timelineLanes';
import { timelineEndMs } from '../../utils/exhibits/timeline/timelineEndMs';
import type { ExhibitTimelineData } from '../../@types/exhibits/timeline/ExhibitTimelineData';
import { SECONDS_PER_DAY } from '../../data/time/secondsPerDay';

const REFRESH_MS = 250;

export type ExhibitTimelineContainerProps = {
  readonly data: ExhibitTimelineData;
};

function ExhibitTimelineContainer({ data }: ExhibitTimelineContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const craft = useAppSelector(selectTimelineLane);
  const lanes = useMemo(() => timelineLanes(data.lanes), [data.lanes]);
  // An open end is the wall clock as the exhibit opened; it does not creep.
  const endMs = useMemo(() => timelineEndMs(data), [data]);

  const { paused, profile } = time;

  const read = useCallback(() => {
    const now = performance.now();
    // A finished profile holds its table with slope 0; the ladder label then reads true again.
    return {
      simDays: deriveSimDays(time, now),
      speed: profile === null ? 0 : clockProfileRate(profile, now),
    };
  }, [time, profile]);
  const [{ simDays, speed }, setReading] = useState(read);
  useEffect(() => {
    const update = () => setReading(read());
    update();
    const id = setInterval(update, REFRESH_MS);
    return () => clearInterval(id);
  }, [read]);

  const onSeek = useCallback(
    (days: number) => dispatch(setSimDays({ simDays: days, nowMs: performance.now() })),
    [dispatch],
  );

  const onStep = useCallback(
    (eventId: string) => {
      const event = data.events.find((e) => e.id === eventId)!;
      const simDays = unixMsToJulianDays(timelineEventStepMs(event));
      dispatch(stepToEvent({ eventId, simDays, nowMs: performance.now() }));
    },
    [dispatch, data.events],
  );

  const onPlayPause = useCallback(
    () => dispatch(paused ? playTimeline() : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );
  const onSlower = useCallback(() => dispatch(stepTimelineSpeed({ step: -1 })), [dispatch]);
  const onFaster = useCallback(() => dispatch(stepTimelineSpeed({ step: 1 })), [dispatch]);
  const factor = useAppSelector(selectTimelineSpeed);
  // Playing, the label is the profile's live speed; otherwise the factor the next run plays at.
  const clock = {
    paused,
    rateLabel: speed > 0 ? formatSimRate(speed) : formatTimelineSpeed(factor),
    profiled: speed > 0,
    showTime: speed > 0 && speed < SECONDS_PER_DAY,
    atSlowest: factor <= TIMELINE_SPEEDS[0]!,
    atFastest: factor >= TIMELINE_SPEEDS.at(-1)!,
  };

  const onSelect = useCallback((id: string) => dispatch(setTimelineLane(id)), [dispatch]);

  return (
    <ExhibitTimeline
      section={data}
      lanes={lanes}
      selectedId={craft!}
      simDays={simDays}
      endMs={endMs}
      onSeek={onSeek}
      onStep={onStep}
      onSelect={onSelect}
      clock={clock}
      onPlayPause={onPlayPause}
      onSlower={onSlower}
      onFaster={onFaster}
    />
  );
}

export default memo(ExhibitTimelineContainer);
