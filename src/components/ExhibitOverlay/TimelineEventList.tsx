/**
 * TimelineEventList — the timeline's chronological event rows. The current row expands to
 * its authored caption and, for flybys, the measured centre distance. Hovering or focusing
 * a row reports its id so the track can ring the matching tick.
 */

import type { CSSProperties, ReactNode } from 'react';
import cx from 'classnames';

import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import styles from './ExhibitTimeline.module.css';

export type TimelineEventListProps = {
  readonly events: readonly MissionEvent[];
  readonly lanes: readonly TimelineLane[];
  readonly captions: Readonly<Record<string, string>> | undefined;
  readonly currentId: string | null;
  readonly onSeekMs: (ms: number) => void;
  readonly onHot: (id: string | null) => void;
};

function TimelineEventList({
  events,
  lanes,
  captions,
  currentId,
  onSeekMs,
  onHot,
}: TimelineEventListProps): ReactNode {
  return (
    <ol className={styles.list}>
      {events.map((e) => {
        const isCurrent = currentId === e.id;
        const lane = lanes.find((l) => l.bodyId === e.bodyId);
        const caption = captions?.[e.id];
        return (
          <li key={e.id} className={cx(styles.item, isCurrent && styles.itemCurrent)}>
            <button
              type="button"
              className={styles.row}
              style={{ '--lane': lane?.color } as CSSProperties}
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => onSeekMs(missionEventMs(e))}
              onPointerEnter={() => onHot(e.id)}
              onPointerLeave={() => onHot(null)}
              onFocus={() => onHot(e.id)}
              onBlur={() => onHot(null)}
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
  );
}

export default TimelineEventList;
