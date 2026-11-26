/**
 * TimelineLaneTabs — one tab per craft; the selection is the store's timeline lane, so
 * choosing a craft also dims the other in the 3D view. Arrow keys move between tabs.
 */

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';

import type { TimelineLane } from '../../@types/exhibits/timeline/TimelineLane';
import styles from './ExhibitTimeline.module.css';

export type TimelineLaneTabsProps = {
  readonly lanes: readonly TimelineLane[];
  readonly selectedId: string;
  readonly onSelect: (bodyId: string) => void;
};

function TimelineLaneTabs({ lanes, selectedId, onSelect }: TimelineLaneTabsProps): ReactNode {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = lanes.findIndex((l) => l.bodyId === selectedId);
    const next = lanes[(i + step + lanes.length) % lanes.length]!;
    onSelect(next.bodyId);
    e.currentTarget.querySelector<HTMLElement>(`[data-body="${next.bodyId}"]`)?.focus();
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label="Timelines" onKeyDown={onKeyDown}>
      {lanes.map((lane) => {
        const selected = lane.bodyId === selectedId;
        return (
          <button
            key={lane.bodyId}
            type="button"
            role="tab"
            data-body={lane.bodyId}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.tabSelected)}
            style={{ '--lane': lane.color } as CSSProperties}
            onClick={() => onSelect(lane.bodyId)}
          >
            {lane.label}
          </button>
        );
      })}
    </div>
  );
}

export default TimelineLaneTabs;
