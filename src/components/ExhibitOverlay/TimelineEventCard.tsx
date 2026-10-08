/**
 * TimelineEventCard — the one current event of the selected craft: date, label, authored
 * caption and, for flybys, the measured centre distance. Before the craft's launch it says so.
 */

import type { ReactNode } from 'react';

import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import styles from './ExhibitTimeline.module.css';

export type TimelineEventCardProps = {
  readonly craftLabel: string;
  /** Null before the craft's first event. */
  readonly event: MissionEvent | null;
  readonly caption: string | undefined;
  /** Set while the camera rides this event; carries the craft's live distance from the target. */
  readonly riding: { readonly distanceKm: number | null } | null;
};

function TimelineEventCard({
  craftLabel,
  event,
  caption,
  riding,
}: TimelineEventCardProps): ReactNode {
  if (!event) {
    return (
      <div className={styles.card}>
        <p className={styles.caption}>{craftLabel} has not launched yet.</p>
      </div>
    );
  }
  return (
    // Keyed on the event so the entrance animation replays on each step.
    <div key={event.id} className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.date}>{formatEventDate(event.iso)}</span>
        <span className={styles.cardLabel}>{event.label}</span>
      </div>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      {riding ? (
        <p className={styles.riding}>
          Riding along with {craftLabel} past {event.label}
          {riding.distanceKm === null
            ? ''
            : ` · ${Math.round(riding.distanceKm).toLocaleString('en-US')} km from its centre`}
        </p>
      ) : null}
      {event.closestKm !== undefined ? (
        <p className={styles.distance}>
          {event.closestKm.toLocaleString('en-US')} km from {event.label}’s centre
        </p>
      ) : null}
    </div>
  );
}

export default TimelineEventCard;
