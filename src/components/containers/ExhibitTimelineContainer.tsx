/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant and the
 * emphasised craft in, `setSimDays` (scrub), `stepToMissionEvent` (chapter steps) and `setMissionEmphasis` and `showWholeMission` out (the craft tabs ARE the store's
 * emphasis, so the 3D view dims the other craft). The instant is re-derived on a 4 Hz interval, the way the TimeBar's
 * readout is, so a running clock re-renders this leaf and not the whole exhibit overlay.
 * Both clock actions leave rate and pause alone, so a seek never stops or starts the clock.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitOverlay/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCameraRide } from '../../state/camera/selectors';
import { showWholeMission } from '../../state/exhibits/showWholeMission';
import { selectTimeState } from '../../state/time/selectors';
import { selectMissionEmphasis } from '../../state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../state/settings/core/orbitTrails/slice';
import { stepToMissionEvent } from '../../state/exhibits/stepToMissionEvent';
import { setSimDays } from '../../state/time/timeSlice';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { flybyRelativeState } from '../../utils/exhibits/ride/flybyRelativeState';
import { timelineLanes } from '../../utils/exhibits/timeline/timelineLanes';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';

const REFRESH_MS = 250;

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

  const onStep = useCallback(
    (eventId: string) => dispatch(stepToMissionEvent({ eventId, nowMs: performance.now() })),
    [dispatch],
  );

  const onWholeMission = useCallback(() => dispatch(showWholeMission()), [dispatch]);

  const rideState = useAppSelector(selectCameraRide);
  const riding = useMemo(() => {
    const event = rideState && section.events.find((e) => e.id === rideState.eventId);
    if (!event) return null;
    const rel = flybyRelativeState(event, simDays);
    return { event, distanceKm: rel === null ? null : Math.hypot(...rel.rKm) };
  }, [rideState, section.events, simDays]);

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
      riding={riding}
      onWholeMission={onWholeMission}
    />
  );
}

export default memo(ExhibitTimelineContainer);
