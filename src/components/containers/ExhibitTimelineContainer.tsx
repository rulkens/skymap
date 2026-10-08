/**
 * ExhibitTimelineContainer — store boundary for the exhibit timeline: the sim instant, rate step,
 * paused flag, ride profile and emphasised craft in; `setSimDays` (scrub), `stepToMissionEvent`,
 * `setMissionEmphasis`, `showWholeMission` and the transport's `pause`/`resume`/`setRate` out (the
 * craft tabs ARE the store's emphasis, so the 3D view dims the other craft). The instant and the
 * ride's live speed are re-derived on a 4 Hz interval, as the TimeBar's readout is, so a running
 * clock re-renders this leaf and not the whole exhibit overlay. Seek and step leave rate and
 * pause alone, so they never stop or start the clock.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import ExhibitTimeline from '../ExhibitOverlay/ExhibitTimeline';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectCameraRide } from '../../state/camera/selectors';
import { showWholeMission } from '../../state/exhibits/showWholeMission';
import { selectRateStep, selectTimeState } from '../../state/time/selectors';
import { selectMissionEmphasis } from '../../state/settings/core/orbitTrails/selectors';
import { setMissionEmphasis } from '../../state/settings/core/orbitTrails/slice';
import { stepToMissionEvent } from '../../state/exhibits/stepToMissionEvent';
import { pause, resume, setRate, setSimDays } from '../../state/time/timeSlice';
import { RATE_LADDER } from '../../data/time/rateLadder';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { formatRideRate } from '../../utils/time/formatRideRate';
import { rideProfileRate } from '../../utils/time/rideProfileRate';
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

  const rateStep = useAppSelector(selectRateStep);
  const { paused, rateIndex, profile } = time;

  const read = useCallback(() => {
    const now = performance.now();
    // A finished ride holds its table with slope 0; the ladder label then reads true again.
    const speed = profile === null ? 0 : rideProfileRate(profile, now);
    return {
      simDays: deriveSimDays(time, now),
      rideRate: speed > 0 ? formatRideRate(speed) : null,
    };
  }, [time, profile]);
  const [{ simDays, rideRate }, setReading] = useState(read);
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

  const onWholeMission = useCallback(() => dispatch(showWholeMission()), [dispatch]);

  const rideState = useAppSelector(selectCameraRide);
  const riding = useMemo(() => {
    const event = rideState && section.events.find((e) => e.id === rideState.eventId);
    if (!event) return null;
    const rel = flybyRelativeState(event, simDays);
    return { event, distanceKm: rel === null ? null : Math.hypot(...rel.rKm) };
  }, [rideState, section.events, simDays]);

  const onPlayPause = useCallback(
    () =>
      dispatch(paused ? resume({ nowMs: performance.now() }) : pause({ nowMs: performance.now() })),
    [dispatch, paused],
  );
  // Ends are inert, as in the TimeBar: a clamped step would re-anchor a live clock for nothing.
  const atSlowest = rateIndex === 0;
  const atFastest = rateIndex === RATE_LADDER.length - 1;
  const onSlower = useCallback(() => {
    if (!atSlowest) dispatch(setRate({ rateIndex: rateIndex - 1, nowMs: performance.now() }));
  }, [dispatch, rateIndex, atSlowest]);
  const onFaster = useCallback(() => {
    if (!atFastest) dispatch(setRate({ rateIndex: rateIndex + 1, nowMs: performance.now() }));
  }, [dispatch, rateIndex, atFastest]);
  const clock = {
    paused,
    rateLabel: rideRate ?? (time.mode === 'live' ? 'Live' : (rateStep?.label ?? '')),
    riding: rideRate !== null,
    atSlowest,
    atFastest,
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
      riding={riding}
      onWholeMission={onWholeMission}
      clock={clock}
      onPlayPause={onPlayPause}
      onSlower={onSlower}
      onFaster={onFaster}
    />
  );
}

export default memo(ExhibitTimelineContainer);
