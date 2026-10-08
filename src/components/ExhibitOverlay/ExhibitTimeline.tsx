/**
 * ExhibitTimeline — the exhibit notes' mission timeline, one craft at a time: craft tabs, the
 * current event card, the transport row (previous / run / date / rate / next) and the
 * `TimelineTrack` scrubber of that craft's lane. Presentational: the container hands it the
 * sim instant (throttled, never per-frame), the clock readout and the selection, and takes the
 * callbacks back; `onSeek` is the free scrub, `onStep` every event step. Seeking sets the clock
 * only; rate, play state and camera are the visitor's own.
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
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { timelineAxis } from '../../utils/exhibits/timeline/timelineAxis';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineClock } from '../../@types/exhibits/ExhibitTimelineClock';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
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
  /** The flyby being ridden and the craft's live distance from its target; null when not riding. */
  readonly riding: { readonly event: MissionEvent; readonly distanceKm: number | null } | null;
  readonly onWholeMission: () => void;
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
  riding,
  onWholeMission,
  clock,
  onPlayPause,
  onSlower,
  onFaster,
}: ExhibitTimelineProps): ReactNode {
  const { eras } = section;
  const lane = lanes.find((l) => l.bodyId === selectedId) ?? lanes[0]!;
  const events = useMemo(
    () => section.events.filter((e) => e.bodyId === lane.bodyId),
    [section.events, lane.bodyId],
  );
  const axis = useMemo(() => timelineAxis(eras, endMs), [eras, endMs]);
  const headingId = useId();

  const simMs = julianDaysToUnixMs(simDays);
  // A ride rewinds the clock to before its event, so the clock would name the previous chapter.
  const ridden = events.find((e) => e.id === riding?.event.id) ?? null;
  const current = ridden ?? currentMissionEvent(events, simMs);
  const stepFromMs = ridden ? missionEventMs(ridden) : simMs;
  const prevId = adjacentEventId(events, stepFromMs, -1);
  const nextId = adjacentEventId(events, stepFromMs, 1);
  const onSeekMs = (ms: number) => onSeek(unixMsToJulianDays(ms));
  const stepTo = (id: string | null) => (id ? () => onStep(id) : null);

  return (
    <div className={styles.root} role="group" aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {section.heading}
        </h2>
        {riding ? (
          <button type="button" className={styles.wholeMission} onClick={onWholeMission}>
            Whole mission
          </button>
        ) : null}
      </div>
      <div className={styles.srOnly} aria-live="polite">
        {current ? `${lane.label} · ${current.label} · ${formatEventDate(current.iso)}` : ''}
      </div>

      <TimelineCraftTabs lanes={lanes} selectedId={lane.bodyId} onSelect={onSelect} />
      <div className={styles.story} style={{ '--lane': lane.color } as CSSProperties}>
        <TimelineEventCard craftLabel={lane.label} event={current} riding={riding} />
        <TimelineTransport
          simMs={simMs}
          clock={clock}
          showTime={riding !== null}
          onPrev={stepTo(prevId)}
          onNext={stepTo(nextId)}
          onPlayPause={onPlayPause}
          onSlower={onSlower}
          onFaster={onFaster}
        />
        <TimelineTrack
          events={events}
          eras={eras}
          lanes={[lane]}
          axis={axis}
          simMs={simMs}
          endMs={endMs}
          currentId={current?.id ?? null}
          onSeekMs={onSeekMs}
          onStep={onStep}
        />
      </div>
    </div>
  );
}

export default ExhibitTimeline;
