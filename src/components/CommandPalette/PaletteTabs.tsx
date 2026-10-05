/**
 * PaletteTabs — the browse-tab strip between the search input and the grid:
 * a `role="tablist"` row of `role="tab"` buttons. Purely presentational —
 * `CommandPalette` decides which tab is active and owns the fallback when
 * the stored tab has no cards.
 */
import type { ReactNode } from 'react';
import cx from 'classnames';
import type { PaletteTab } from '../../@types/palette/PaletteTab';
import type { PaletteTabId } from '../../@types/palette/PaletteTabId';
import styles from './PaletteTabs.module.css';

export type PaletteTabsProps = {
  readonly tabs: readonly PaletteTab[];
  readonly active: PaletteTabId;
  readonly onChange: (id: PaletteTabId) => void;
};

function PaletteTabs({ tabs, active, onChange }: PaletteTabsProps): ReactNode {
  return (
    <div className={styles.root} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={cx(styles.tab, tab.id === active && styles.active)}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default PaletteTabs;
