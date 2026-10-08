/**
 * TimelineTrack — the scrubber of the exhibit timeline: era headers, the selected craft's lane
 * with its fill and event ticks, the thumb, and the year axis. Pointer drag and the free keys
 * report instants through `onSeekMs`; PageUp / PageDown and the event dots step through `onStep`.
 * The parent owns the clock.
 */

import { useMemo } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import cx from 'classnames';

import { adjacentEventId } from '../../utils/exhibits/timeline/adjacentEventId';
import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { describeTimelineInstant } from '../../utils/exhibits/timeline/describeTimelineInstant';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { timelineAxisLabels } from '../../utils/exhibits/timeline/timelineAxisLabels';
import { timelineFraction } from '../../utils/exhibits/timeline/timelineFraction';
import { timelineInstant } from '../../utils/exhibits/timeline/timelineInstant';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import type { TimelineAxis } from '../../@types/exhibits/TimelineAxis';
import type { TimelineEra } from '../../@types/exhibits/TimelineEra';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import { DAY_MS } from '../../data/time/dayMs';
import { YEAR_MS } from '../../data/time/yearMs';
import styles from './ExhibitTimeline.module.css';

export type TimelineTrackProps = {
  readonly events: readonly MissionEvent[];
  readonly eras: readonly TimelineEra[];
  readonly lanes: readonly TimelineLane[];
  readonly axis: TimelineAxis;
  readonly simMs: number;
  readonly endMs: number;
  readonly currentId: string | null;
  readonly onSeekMs: (ms: number) => void;
  readonly onStep: (eventId: string) => void;
};

const MONTH_MS = 30.4375 * DAY_MS;

const pct = (fraction: number) => `${fraction * 100}%`;

function TimelineTrack({
  events,
  eras,
  lanes,
  axis,
  simMs,
  endMs,
  currentId,
  onSeekMs,
  onStep,
}: TimelineTrackProps): ReactNode {
  const labels = useMemo(() => timelineAxisLabels(axis), [axis]);
  const thumb = timelineFraction(simMs, axis);
  const firstMs = missionEventMs(events[0]!);
  const beforeLaunch = simMs < firstMs;
  const pastNow = simMs > endMs + DAY_MS;

  const commitFromClientX = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    onSeekMs(timelineInstant((clientX - rect.left) / rect.width, axis));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    commitFromClientX(e.currentTarget, e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      commitFromClientX(e.currentTarget, e.clientX);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const span = e.shiftKey ? YEAR_MS : MONTH_MS;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = simMs + span;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = simMs - span;
        break;
      case 'PageUp':
      case 'PageDown': {
        const id = adjacentEventId(events, simMs, e.key === 'PageUp' ? -1 : 1);
        if (id) onStep(id);
        break;
      }
      case 'Home':
        next = firstMs;
        break;
      case 'End':
        next = endMs;
        break;
      default:
        return;
    }
    // Without this the page scrolls under the focused slider.
    e.preventDefault();
    if (next !== null) onSeekMs(next);
  };

  return (
    <div className={styles.plot}>
      <div
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label="Mission clock"
        aria-valuemin={0}
        aria-valuemax={1000}
        aria-valuenow={Math.round(thumb * 1000)}
        aria-valuetext={describeTimelineInstant(simMs, events, lanes)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className={styles.eras} aria-hidden="true">
          {eras.map((era) => (
            <span key={era.fromIso} className={styles.era}>
              {era.label}
            </span>
          ))}
        </div>
        {lanes.map((lane) => {
          const mine = events.filter((e) => e.bodyId === lane.bodyId);
          const launchMs = missionEventMs(mine[0]!);
          const from = timelineFraction(launchMs, axis);
          const to = timelineFraction(Math.min(simMs, endMs), axis);
          return (
            <div
              key={lane.bodyId}
              className={styles.lane}
              style={{ '--lane': lane.color } as CSSProperties}
            >
              <div className={styles.laneLine} />
              <div
                className={styles.laneFill}
                style={{ left: pct(from), width: pct(simMs > launchMs ? to - from : 0) }}
              />
              {mine.map((e) => (
                <button
                  type="button"
                  key={e.id}
                  // Previous / Next are the accessible twin; the slider's children are presentational.
                  tabIndex={-1}
                  aria-hidden="true"
                  aria-label={`${e.label}, ${formatEventDate(e.iso)}`}
                  title={`${e.label} · ${formatEventDate(e.iso)}`}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onClick={() => onStep(e.id)}
                  className={cx(
                    styles.tick,
                    styles[e.kind],
                    missionEventMs(e) <= simMs && styles.passed,
                    currentId === e.id && styles.current,
                  )}
                  style={{ left: pct(timelineFraction(missionEventMs(e), axis)) }}
                />
              ))}
            </div>
          );
        })}
        <div className={styles.thumb} style={{ left: pct(thumb) }}>
          <span className={styles.knob} />
        </div>
        {beforeLaunch ? <span className={styles.before}>before launch</span> : null}
        {pastNow ? (
          <span className={styles.beyond}>→ {new Date(simMs).getUTCFullYear()}</span>
        ) : null}
        <div className={styles.axis} aria-hidden="true">
          {labels.map((label) => (
            <span
              key={label.text}
              className={cx(
                styles.axisLabel,
                label.fraction === 0 && styles.axisFirst,
                label.fraction === 1 && styles.axisLast,
              )}
              style={{ left: pct(label.fraction) }}
            >
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TimelineTrack;
