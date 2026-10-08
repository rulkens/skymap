/**
 * ExhibitTimeline — the exhibit notes' mission timeline, one craft at a time: craft tabs, a
 * chapter bar and event card with Previous / Next for the selected craft, and a subdued
 * `TimelineTrack` scrubber of that craft's lane. Presentational: the container hands it the
 * sim instant (throttled, never per-frame) and the selection, and takes `onSeek`/`onSelect`
 * back; `onSeek` is the free scrub, `onStep` every chapter step. Seeking sets the clock only; rate, play state and camera are the visitor's own.
 */

import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import TimelineChapterBar from './TimelineChapterBar';
import TimelineCraftTabs from './TimelineCraftTabs';
import TimelineEventCard from './TimelineEventCard';
import TimelineStepper from './TimelineStepper';
import TimelineTrack from './TimelineTrack';
import { adjacentEventId } from '../../utils/exhibits/timeline/adjacentEventId';
import { currentMissionEvent } from '../../utils/exhibits/timeline/currentMissionEvent';
import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { timelineAxis } from '../../utils/exhibits/timeline/timelineAxis';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import { DAY_MS } from '../../data/time/dayMs';
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
}: ExhibitTimelineProps): ReactNode {
  const { eras, captions } = section;
  const lane = lanes.find((l) => l.bodyId === selectedId) ?? lanes[0]!;
  const events = useMemo(
    () => section.events.filter((e) => e.bodyId === lane.bodyId),
    [section.events, lane.bodyId],
  );
  const subtitles = useMemo(
    () => Object.fromEntries(section.crafts.map((c) => [c.bodyId, c.route])),
    [section.crafts],
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
  const daysSinceLaunch = Math.floor((simMs - missionEventMs(events[0]!)) / DAY_MS);
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
        <span className={styles.meta}>
          {daysSinceLaunch < 0
            ? `before ${lane.label}’s launch`
            : `${daysSinceLaunch.toLocaleString('en-US')} days after ${lane.label}’s launch`}
        </span>
      </div>
      <div className={styles.srOnly} aria-live="polite">
        {current ? `${lane.label} · ${current.label} · ${formatEventDate(current.iso)}` : ''}
      </div>

      <TimelineCraftTabs
        lanes={lanes}
        subtitles={subtitles}
        selectedId={lane.bodyId}
        onSelect={onSelect}
      />
      <div className={styles.story} style={{ '--lane': lane.color } as CSSProperties}>
        <TimelineChapterBar
          events={events}
          currentId={current?.id ?? null}
          simMs={simMs}
          onStep={onStep}
        />
        <TimelineEventCard
          craftLabel={lane.label}
          event={current}
          caption={current ? captions[current.id] : undefined}
          riding={riding}
        />
        <TimelineStepper
          index={current ? events.indexOf(current) + 1 : 0}
          total={events.length}
          onPrev={stepTo(prevId)}
          onNext={stepTo(nextId)}
        />
      </div>

      <div className={styles.scrubber}>
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

      <div className={styles.hint}>
        <span className={styles.hintKeys}>
          <kbd>\</kbd> run the clock · <kbd>]</kbd> faster · <kbd>,</kbd> <kbd>.</kbd> previous /
          next event
        </span>
        <span className={styles.hintTouch}>Run the clock from the time bar below.</span>
      </div>
    </div>
  );
}

export default ExhibitTimeline;
