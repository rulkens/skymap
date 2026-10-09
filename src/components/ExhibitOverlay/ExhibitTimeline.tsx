/**
 * ExhibitTimeline — the exhibit notes' mission timeline, one craft at a time: craft tabs, the
 * current event card, the transport row (previous / run / date / rate / next) and the
 * `TimelineTrack` scrubber of that craft's lane. Presentational: the container hands it the
 * sim instant (throttled, never per-frame), the clock readout and the selection, and takes the
 * callbacks back; `onSeek` is the free scrub, `onStep` every event step. The axis gives each
 * mission leg the same width and runs from the craft's launch to now.
 */

import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import TimelineCraftTabs from './TimelineCraftTabs';
import TimelineEventCard from './TimelineEventCard';
import TimelineTrack from './TimelineTrack';
import TimelineTransport from './TimelineTransport';
import { adjacentEventId } from '../../utils/exhibits/timeline/adjacentEventId';
import { currentMissionEvent } from '../../utils/exhibits/timeline/currentMissionEvent';
import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionStops } from '../../utils/exhibits/mission/missionStops';
import { timelineAxis } from '../../utils/exhibits/timeline/timelineAxis';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineClock } from '../../@types/exhibits/ExhibitTimelineClock';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import styles from './ExhibitTimeline.module.css';

export type ExhibitTimelineProps = {
  readonly section: ExhibitTimelineSection;
  readonly lanes: readonly TimelineLane[];
  /** The craft shown; a lane's `bodyId`. */
  readonly selectedId: string;
  /** The sim instant, as a UT Julian date. */
  readonly simDays: number;
  /** Wall-clock now in Unix ms: the axis's right edge. */
  readonly endMs: number;
  readonly onSeek: (simDays: number) => void;
  readonly onStep: (eventId: string) => void;
  readonly onSelect: (bodyId: string) => void;
  readonly clock: ExhibitTimelineClock;
  readonly onPlayPause: () => void;
  readonly onSlower: () => void;
  readonly onFaster: () => void;
};

function ExhibitTimeline({
  section,
  lanes,
  selectedId,
  simDays,
  endMs,
  onSeek,
  onStep,
  onSelect,
  clock,
  onPlayPause,
  onSlower,
  onFaster,
}: ExhibitTimelineProps): ReactNode {
  const lane = lanes.find((l) => l.bodyId === selectedId) ?? lanes[0]!;
  const events = useMemo(
    () => section.events.filter((e) => e.bodyId === lane.bodyId),
    [section.events, lane.bodyId],
  );
  const stops = useMemo(() => missionStops(events), [events]);
  const axis = useMemo(() => timelineAxis(stops, endMs), [stops, endMs]);
  const headingId = useId();

  const simMs = julianDaysToUnixMs(simDays);
  // The scrub range starts at launch, so the launch stands in for any earlier instant.
  const current = currentMissionEvent(events, simMs) ?? events[0]!;
  const prevId = adjacentEventId(events, simMs, -1);
  const nextId = adjacentEventId(events, simMs, 1);
  const onSeekMs = (ms: number) => onSeek(unixMsToJulianDays(ms));
  const stepTo = (id: string | null) => (id ? () => onStep(id) : null);

  return (
    <div className={styles.root} role="group" aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {section.heading}
      </h2>
      <div className={styles.srOnly} aria-live="polite">
        {`${lane.label} · ${current.label} · ${formatEventDate(current.iso)}`}
      </div>

      <TimelineCraftTabs lanes={lanes} selectedId={lane.bodyId} onSelect={onSelect} />
      <div className={styles.story} style={{ '--lane': lane.color } as CSSProperties}>
        <TimelineEventCard event={current} />
        <TimelineTransport
          simMs={simMs}
          clock={clock}
          onPrev={stepTo(prevId)}
          onNext={stepTo(nextId)}
          onPlayPause={onPlayPause}
          onSlower={onSlower}
          onFaster={onFaster}
        />
        <TimelineTrack
          events={events}
          stops={stops}
          lanes={[lane]}
          axis={axis}
          simMs={simMs}
          endMs={endMs}
          currentId={current.id}
          onSeekMs={onSeekMs}
          onStep={onStep}
        />
      </div>
    </div>
  );
}

export default ExhibitTimeline;
