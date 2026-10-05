/**
 * ExhibitTimeline — the exhibit notes' mission timeline: one lane per craft on an era-split
 * axis, a draggable thumb, and the events as a chronological list. Presentational: the
 * container hands it the sim instant (throttled, never per-frame) and takes `onSeek` back.
 * Seeking sets the clock only; rate, play state and camera are the visitor's own.
 */

import { useId, useMemo, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import cx from 'classnames';

import { adjacentMissionEvent } from '../../utils/exhibits/timeline/adjacentMissionEvent';
import { currentMissionEvent } from '../../utils/exhibits/timeline/currentMissionEvent';
import { describeTimelineInstant } from '../../utils/exhibits/timeline/describeTimelineInstant';
import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import { timelineAxis } from '../../utils/exhibits/timeline/timelineAxis';
import { timelineAxisLabels } from '../../utils/exhibits/timeline/timelineAxisLabels';
import { timelineFraction } from '../../utils/exhibits/timeline/timelineFraction';
import { timelineInstant } from '../../utils/exhibits/timeline/timelineInstant';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';
import type { ExhibitTimelineSection } from '../../@types/exhibits/ExhibitTimelineSection';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
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

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.4375;
const YEAR_DAYS = 365.25;

const pct = (fraction: number) => `${fraction * 100}%`;

function ExhibitTimeline({
  section,
  lanes,
  simDays,
  endMs,
  onSeek,
}: ExhibitTimelineProps): ReactNode {
  const { events, captions } = section;
  const axis = useMemo(
    () => timelineAxis(section.fromIso, section.eras, endMs),
    [section.fromIso, section.eras, endMs],
  );
  const labels = useMemo(() => timelineAxisLabels(axis), [axis]);
  const [hotId, setHotId] = useState<string | null>(null);
  const headingId = useId();

  const simMs = julianDaysToUnixMs(simDays);
  const thumb = timelineFraction(simMs, axis);
  const current = currentMissionEvent(events, simMs);
  const firstMs = missionEventMs(events[0]!);
  const seekMs = (ms: number) => onSeek(unixMsToJulianDays(ms));
  const laneOf = (bodyId: string) => lanes.find((l) => l.bodyId === bodyId);

  const commitFromClientX = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    seekMs(timelineInstant((clientX - rect.left) / rect.width, axis));
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
    const span = e.shiftKey ? YEAR_DAYS : MONTH_DAYS;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
        next = simDays + span;
        break;
      case 'ArrowLeft':
        next = simDays - span;
        break;
      case 'PageUp':
      case 'PageDown': {
        const hit = adjacentMissionEvent(events, simMs, e.key === 'PageUp' ? -1 : 1);
        if (hit) next = unixMsToJulianDays(missionEventMs(hit));
        break;
      }
      case 'Home':
        next = unixMsToJulianDays(firstMs);
        break;
      case 'End':
        next = unixMsToJulianDays(endMs);
        break;
      default:
        return;
    }
    // Without this the page scrolls under the focused slider.
    e.preventDefault();
    if (next !== null) onSeek(next);
  };

  const daysSinceLaunch = Math.floor((simMs - firstMs) / DAY_MS);
  const beforeLaunch = daysSinceLaunch < 0;
  const pastNow = simMs > endMs + DAY_MS;

  return (
    <div className={styles.root} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          {section.heading}
        </h2>
        <span className={styles.meta}>
          {beforeLaunch
            ? 'before the first launch'
            : `${daysSinceLaunch.toLocaleString('en-US')} days after the first launch`}
        </span>
      </div>
      <div className={styles.srOnly} aria-live="polite">
        {current
          ? `${laneOf(current.bodyId)?.label} · ${current.label} · ${formatEventDate(current.iso)}`
          : ''}
      </div>

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
            {(section.eras ?? []).map((era) => (
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
                <span className={styles.laneTag}>{lane.tag}</span>
                <div className={styles.laneLine} />
                <div
                  className={styles.laneFill}
                  style={{ left: pct(from), width: pct(simMs > launchMs ? to - from : 0) }}
                />
                {mine.map((e) => (
                  <span
                    key={e.id}
                    className={cx(
                      styles.tick,
                      styles[e.kind],
                      missionEventMs(e) <= simMs && styles.passed,
                      current?.id === e.id && styles.current,
                      hotId === e.id && styles.hot,
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

      <ol className={styles.list}>
        {events.map((e) => {
          const isCurrent = current?.id === e.id;
          const lane = laneOf(e.bodyId);
          const caption = captions?.[e.id];
          return (
            <li key={e.id} className={cx(styles.item, isCurrent && styles.itemCurrent)}>
              <button
                type="button"
                className={styles.row}
                style={{ '--lane': lane?.color } as CSSProperties}
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => seekMs(missionEventMs(e))}
                onPointerEnter={() => setHotId(e.id)}
                onPointerLeave={() => setHotId(null)}
                onFocus={() => setHotId(e.id)}
                onBlur={() => setHotId(null)}
              >
                <span className={cx(styles.glyph, styles[e.kind])} />
                <span className={styles.date}>{formatEventDate(e.iso)}</span>
                <span className={styles.label}>{e.label}</span>
                <span className={styles.tag}>{lane?.tag}</span>
              </button>
              {isCurrent && (caption || e.closestKm !== undefined) ? (
                <div className={styles.detail}>
                  {caption ? <p className={styles.caption}>{caption}</p> : null}
                  {e.closestKm !== undefined ? (
                    <p className={styles.distance}>
                      {e.closestKm.toLocaleString('en-US')} km from {e.label}’s centre
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

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
