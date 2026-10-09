/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant, paused
 * flag, mission profile and emphasised craft in; `setSimDays` (scrub), `stepToMissionEvent`,
 * `setMissionEmphasis`, `playMission`, `stepMissionSpeed` and `pause` out (the craft tabs ARE the
 * store's emphasis, so the 3D view dims the other craft). The instant and the profile's live
 * speed are re-derived on a 4 Hz interval, as the TimeBar's readout is, so a running clock
 * re-renders this leaf and not the whole exhibit overlay.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitOverlay/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { playMission } from '../../state/exhibits/playMission';
import { stepMissionSpeed } from '../../state/exhibits/stepMissionSpeed';
import { stepToMissionEvent } from '../../state/exhibits/stepToMissionEvent';
import { selectRateStep, selectTimeState } from '../../state/time/selectors';
import { selectMissionEmphasis } from '../../state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../state/settings/core/orbitTrails/slice';
import { pause, setSimDays } from '../../state/time/timeSlice';
import { MISSION_SPEEDS } from '../../data/exhibits/mission/missionSpeeds';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatSimRate } from '../../utils/time/formatSimRate';
import { missionProfileRate } from '../../utils/time/missionProfileRate';
import { timelineLanes } from '../../utils/exhibits/timeline/timelineLanes';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';

const REFRESH_MS = 250;
const SECONDS_PER_DAY = 86_400;

export type ExhibitTimelineContainerProps = {
  readonly section: ExhibitTimelineSection;
};

function ExhibitTimelineContainer({ section }: ExhibitTimelineContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const time = useAppSelector(selectTimeState);
  const emphasis = useAppSelector(selectMissionEmphasis);
  const lanes = useMemo(() => {
    const all = timelineLanes(section.events);
    return section.crafts.map((c) => all.find((l) => l.bodyId === c.bodyId)!);
  }, [section.events, section.crafts]);
  // The axis ends at the wall clock as the exhibit opened; it does not creep.
  const endMs = useMemo(() => Date.now(), []);

  const rateStep = useAppSelector(selectRateStep);
  const { paused, profile } = time;

  const read = useCallback(() => {
    const now = performance.now();
    // A finished profile holds its table with slope 0; the ladder label then reads true again.
    return {
      simDays: deriveSimDays(time, now),
      speed: profile === null ? 0 : missionProfileRate(profile, now),
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
    (eventId: string) => dispatch(stepToMissionEvent({ eventId, nowMs: performance.now() })),
    [dispatch],
  );

  const onPlayPause = useCallback(
    () => dispatch(paused ? playMission() : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );
  const onSlower = useCallback(() => dispatch(stepMissionSpeed({ step: -1 })), [dispatch]);
  const onFaster = useCallback(() => dispatch(stepMissionSpeed({ step: 1 })), [dispatch]);
  // Without a profile the saga's remembered factor is not in the store; both ends stay live.
  const speedIndex = profile?.speedIndex ?? null;
  const clock = {
    paused,
    rateLabel:
      speed > 0 ? formatSimRate(speed) : time.mode === 'live' ? 'Live' : (rateStep?.label ?? ''),
    profiled: speed > 0,
    showTime: speed > 0 && speed < SECONDS_PER_DAY,
    atSlowest: speedIndex === 0,
    atFastest: speedIndex === MISSION_SPEEDS.length - 1,
  };

  const onSelect = useCallback((id: string) => dispatch(setMissionEmphasis(id)), [dispatch]);

  return (
    <ExhibitTimeline
      section={section}
      lanes={lanes}
      selectedId={emphasis ?? lanes[0]!.bodyId}
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
