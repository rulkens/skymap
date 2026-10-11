/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant, paused
 * flag, mission profile and selected craft in; `setSimDays` (scrub), `stepToEvent`,
 * `setMissionCraft`, `playMission`, `stepMissionSpeed` and `pause` out (the craft tabs ARE the
 * store's craft, so the 3D view dims the other craft). The instant and the profile's live
 * speed are re-derived on a 4 Hz interval, as the TimeBar's readout is, so a running clock
 * re-renders this leaf and not the whole exhibit overlay.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitOverlay/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { playMission } from '../../state/exhibits/playMission';
import { selectTimeState } from '../../state/time/selectors';
import {
  selectMissionCraft,
  selectMissionSpeed,
} from '../../state/settings/core/missions/selectors';
import { setMissionCraft, stepMissionSpeed } from '../../state/settings/core/missions/slice';
import { pause, setSimDays, stepToEvent } from '../../state/time/timeSlice';
import { MISSION_SPEEDS } from '../../data/exhibits/mission/missionSpeeds';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatMissionSpeed } from '../../utils/exhibits/mission/formatMissionSpeed';
import { formatSimRate } from '../../utils/time/formatSimRate';
import { clockProfileRate } from '../../utils/time/clockProfileRate';
import { missionEventStepMs } from '../../utils/exhibits/timeline/missionEventStepMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import { timelineLanes } from '../../utils/exhibits/timeline/timelineLanes';
import { timelineEndMs } from '../../utils/exhibits/timeline/timelineEndMs';
import type { MissionTimeline } from '../../@types/exhibits/MissionTimeline';
import { SECONDS_PER_DAY } from '../../data/time/secondsPerDay';

const REFRESH_MS = 250;

export type ExhibitTimelineContainerProps = {
  readonly data: MissionTimeline;
};

function ExhibitTimelineContainer({ data }: ExhibitTimelineContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const craft = useAppSelector(selectMissionCraft);
  const lanes = useMemo(() => timelineLanes(data.crafts), [data.crafts]);
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
      const simDays = unixMsToJulianDays(missionEventStepMs(event));
      dispatch(stepToEvent({ eventId, simDays, nowMs: performance.now() }));
    },
    [dispatch, data.events],
  );

  const onPlayPause = useCallback(
    () => dispatch(paused ? playMission() : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );
  const onSlower = useCallback(() => dispatch(stepMissionSpeed({ step: -1 })), [dispatch]);
  const onFaster = useCallback(() => dispatch(stepMissionSpeed({ step: 1 })), [dispatch]);
  const factor = useAppSelector(selectMissionSpeed);
  // Playing, the label is the profile's live speed; otherwise the factor the next run plays at.
  const clock = {
    paused,
    rateLabel: speed > 0 ? formatSimRate(speed) : formatMissionSpeed(factor),
    profiled: speed > 0,
    showTime: speed > 0 && speed < SECONDS_PER_DAY,
    atSlowest: factor <= MISSION_SPEEDS[0]!,
    atFastest: factor >= MISSION_SPEEDS.at(-1)!,
  };

  const onSelect = useCallback((id: string) => dispatch(setMissionCraft(id)), [dispatch]);

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
