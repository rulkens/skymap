/**
 * ExhibitTimeline — the exhibit notes' mission timeline, one craft at a time: craft tabs, a
 * chapter bar and event card with Previous / Next for the selected craft, and a subdued
 * `TimelineTrack` scrubber of that craft's lane. Presentational: the container hands it the
 * sim instant (throttled, never per-frame) and the selection, and takes `onSeek`/`onSelect`
 * back. Seeking sets the clock only; rate, play state and camera are the visitor's own.
 */

import { useId, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import TimelineChapterBar from './TimelineChapterBar';
import TimelineCraftTabs from './TimelineCraftTabs';
import TimelineEventCard from './TimelineEventCard';
import TimelineStepper from './TimelineStepper';
import TimelineTrack from './TimelineTrack';
import { adjacentMissionEvent } from '../../utils/exhibits/timeline/adjacentMissionEvent';
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
  readonly onSelect: (bodyId: string) => void;
};

function ExhibitTimeline({
  section,
  lanes,
  selectedId,
  simDays,
  endMs,
  onSeek,
  onSelect,
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
  const current = currentMissionEvent(events, simMs);
  const prev = adjacentMissionEvent(events, simMs, -1);
  const next = adjacentMissionEvent(events, simMs, 1);
  const daysSinceLaunch = Math.floor((simMs - missionEventMs(events[0]!)) / DAY_MS);
  const onSeekMs = (ms: number) => onSeek(unixMsToJulianDays(ms));
  const seekTo = (e: MissionEvent | null) => (e ? () => onSeekMs(missionEventMs(e)) : null);

  return (
    <div className={styles.root} role="group" aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {section.heading}
        </h2>
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
          onSeekMs={onSeekMs}
        />
        <TimelineEventCard
          craftLabel={lane.label}
          event={current}
          caption={current ? captions[current.id] : undefined}
        />
        <TimelineStepper
          index={current ? events.indexOf(current) + 1 : 0}
          total={events.length}
          onPrev={seekTo(prev)}
          onNext={seekTo(next)}
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
