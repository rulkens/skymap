/**
 * TimelineChapterBar — one clickable segment per event of the selected craft, marked past,
 * current or ahead of the clock. A click steps to that event.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';

import { formatEventDate } from '../../utils/exhibits/timeline/formatEventDate';
import { missionEventMs } from '../../utils/exhibits/timeline/missionEventMs';
import type { MissionEvent } from '../../@types/missions/MissionEvent';
import styles from './ExhibitTimeline.module.css';

export type TimelineChapterBarProps = {
  readonly events: readonly MissionEvent[];
  readonly currentId: string | null;
  readonly simMs: number;
  readonly onStep: (eventId: string) => void;
};

function TimelineChapterBar({
  events,
  currentId,
  simMs,
  onStep,
}: TimelineChapterBarProps): ReactNode {
  return (
    <ol className={styles.chapters}>
      {events.map((e) => {
        const isCurrent = e.id === currentId;
        const passed = missionEventMs(e) <= simMs;
        return (
          <li key={e.id} className={styles.chapterItem}>
            <button
              type="button"
              className={cx(
                styles.chapter,
                passed && styles.chapterPast,
                isCurrent && styles.chapterCurrent,
              )}
              aria-label={`${e.label}, ${formatEventDate(e.iso)}`}
              aria-current={isCurrent ? 'step' : undefined}
              title={`${e.label} · ${formatEventDate(e.iso)}`}
              onClick={() => onStep(e.id)}
            />
          </li>
        );
      })}
    </ol>
  );
}

export default TimelineChapterBar;
