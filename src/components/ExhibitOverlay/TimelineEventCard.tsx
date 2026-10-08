/**
 * TimelineEventCard — the one current event of the selected craft: date and label, plus the
 * live riding line while the camera rides it. Before the craft's launch it says so.
 */

import type { ReactNode } from 'react';

import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import styles from './ExhibitTimeline.module.css';

export type TimelineEventCardProps = {
  readonly craftLabel: string;
  /** Null before the craft's first event. */
  readonly event: MissionEvent | null;
  /** Set while the camera rides this event; carries the craft's live distance from the target. */
  readonly riding: { readonly distanceKm: number | null } | null;
};

function TimelineEventCard({ craftLabel, event, riding }: TimelineEventCardProps): ReactNode {
  if (!event) {
    return (
      <div className={styles.card}>
        <p className={styles.notLaunched}>{craftLabel} has not launched yet.</p>
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
      <p className={styles.riding}>
        {riding
          ? `Riding along with ${craftLabel} past ${event.label}${
              riding.distanceKm === null
                ? ''
                : ` · ${Math.round(riding.distanceKm).toLocaleString('en-US')} km from its centre`
            }`
          : null}
      </p>
    </div>
  );
}

export default TimelineEventCard;
