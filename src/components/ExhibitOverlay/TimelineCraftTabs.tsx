/**
 * TimelineCraftTabs — one tab per craft; the selection is the store's mission emphasis, so
 * choosing a craft also dims the other in the 3D view. Arrow keys move between tabs.
 */

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';

import type { TimelineLane } from '../../@types/exhibits/TimelineLane';
import styles from './ExhibitTimeline.module.css';

export type TimelineCraftTabsProps = {
  readonly lanes: readonly TimelineLane[];
  readonly subtitles: Readonly<Record<string, string>>;
  readonly selectedId: string;
  readonly onSelect: (bodyId: string) => void;
};

function TimelineCraftTabs({
  lanes,
  subtitles,
  selectedId,
  onSelect,
}: TimelineCraftTabsProps): ReactNode {
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
    <div className={styles.tabs} role="tablist" aria-label="Spacecraft" onKeyDown={onKeyDown}>
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
            <span className={styles.tabName}>{lane.label}</span>
            <span className={styles.tabSub}>{subtitles[lane.bodyId]}</span>
          </button>
        );
      })}
    </div>
  );
}

export default TimelineCraftTabs;
