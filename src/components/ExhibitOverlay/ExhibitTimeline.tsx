/**
 * ExhibitTimeline — the exhibit notes' mission timeline: a `TimelineTrack` (lanes on an
 * era-split axis, a draggable thumb) over a `TimelineEventList`. Presentational: the
 * container hands it the sim instant (throttled, never per-frame) and takes `onSeek` back.
 * Seeking sets the clock only; rate, play state and camera are the visitor's own.
 */

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import TimelineEventList from './TimelineEventList';
import TimelineTrack from './TimelineTrack';
import { currentMissionEvent } from '../../utils/exhibits/timeline/currentMissionEvent';
import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { timelineAxis } from '../../utils/exhibits/timeline/timelineAxis';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import { DAY_MS } from '../../data/time/dayMs';
import styles from './ExhibitTimeline.module.css';

export type ExhibitTimelineProps = {
  readonly section: ExhibitTimelineSection;
  readonly lanes: readonly TimelineLane[];
  /** The sim instant, as a UT Julian date. */
  readonly simDays: number;
  /** Wall-clock now in Unix ms: the axis's right edge. */
  readonly endMs: number;
  readonly onSeek: (simDays: number) => void;
};

function ExhibitTimeline({
  section,
  lanes,
  simDays,
  endMs,
  onSeek,
}: ExhibitTimelineProps): ReactNode {
  const { events, eras, captions } = section;
  const axis = useMemo(() => timelineAxis(eras, endMs), [eras, endMs]);
  const [hotId, setHotId] = useState<string | null>(null);
  const headingId = useId();

  const simMs = julianDaysToUnixMs(simDays);
  const current = currentMissionEvent(events, simMs);
  const daysSinceLaunch = Math.floor((simMs - missionEventMs(events[0]!)) / DAY_MS);
  const onSeekMs = (ms: number) => onSeek(unixMsToJulianDays(ms));

  return (
    <div className={styles.root} role="group" aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {section.heading}
        </h2>
        <span className={styles.meta}>
          {daysSinceLaunch < 0
            ? 'before the first launch'
            : `${daysSinceLaunch.toLocaleString('en-US')} days after the first launch`}
        </span>
      </div>
      <div className={styles.srOnly} aria-live="polite">
        {current
          ? `${lanes.find((l) => l.bodyId === current.bodyId)?.label} · ${current.label} · ${formatEventDate(current.iso)}`
          : ''}
      </div>

      <TimelineTrack
        events={events}
        eras={eras}
        lanes={lanes}
        axis={axis}
        simMs={simMs}
        endMs={endMs}
        currentId={current?.id ?? null}
        hotId={hotId}
        onSeekMs={onSeekMs}
      />
      <TimelineEventList
        events={events}
        lanes={lanes}
        captions={captions}
        currentId={current?.id ?? null}
        onSeekMs={onSeekMs}
        onHot={setHotId}
      />

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
