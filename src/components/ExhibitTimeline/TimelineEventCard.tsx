/** TimelineEventCard — the one current event of the selected craft: its date and label. */

import type { ReactNode } from 'react';

import { formatClockDate } from '../../utils/exhibits/timeline/formatClockDate';
import { timelineEventMs } from '../../utils/exhibits/timeline/timelineEventMs';
import type { TimelineEvent } from '../../@types/exhibits/timeline/TimelineEvent';
import styles from './ExhibitTimeline.module.css';

export type TimelineEventCardProps = {
  readonly event: TimelineEvent;
};

function TimelineEventCard({ event }: TimelineEventCardProps): ReactNode {
  return (
    // Keyed on the event so the entrance animation replays on each step.
    <div key={event.id} className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.date}>{formatClockDate(timelineEventMs(event))}</span>
        <span className={styles.cardLabel}>{event.label}</span>
      </div>
    </div>
  );
}

export default TimelineEventCard;
