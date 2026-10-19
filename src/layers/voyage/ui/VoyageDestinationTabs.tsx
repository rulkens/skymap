/**
 * VoyageDestinationTabs — one tab per trip; the selection is the cluster's destination, so a tab
 * re-launches the trip (the hold's job). Arrow keys move between tabs, as `TimelineCraftTabs`.
 */

import type { KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';

import type { VoyageDestination } from '../@types/VoyageDestination';
import type { VoyageDestinationId } from '../@types/VoyageDestinationId';
import styles from './Voyage.module.css';

export type VoyageDestinationTabsProps = {
  readonly destinations: readonly VoyageDestination[];
  readonly selectedId: VoyageDestinationId;
  readonly onSelect: (id: VoyageDestinationId) => void;
};

function VoyageDestinationTabs({
  destinations,
  selectedId,
  onSelect,
}: VoyageDestinationTabsProps): ReactNode {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = destinations.findIndex((d) => d.id === selectedId);
    const next = destinations[(i + step + destinations.length) % destinations.length]!;
    onSelect(next.id);
    e.currentTarget.querySelector<HTMLElement>(`[data-destination="${next.id}"]`)?.focus();
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label="Destination" onKeyDown={onKeyDown}>
      {destinations.map((d) => {
        const selected = d.id === selectedId;
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            data-destination={d.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.tab, selected && styles.tabSelected)}
            onClick={() => onSelect(d.id)}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export default VoyageDestinationTabs;
