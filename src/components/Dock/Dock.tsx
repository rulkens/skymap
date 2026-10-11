/**
 * Dock — the phone's bottom navigation: Home, Search, Time and Layers, each
 * with an icon and a visible label. Presentational: which panels are open and
 * the Time label arrive as props; taps leave as callbacks. Time and Layers are
 * toggles, marked open by an indicator bar and aria-pressed, not colour alone;
 * Home and Search are one-shot actions and carry neither.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';
import styles from './Dock.module.css';

// 24-unit stroke icons, one path each.
const ICON_PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
  time: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
} as const;

type DockItemProps = {
  readonly icon: keyof typeof ICON_PATHS;
  readonly label: DockTimeLabel;
  /** Omitted for an action item, which has no open state. */
  readonly open?: boolean;
  readonly onClick: () => void;
};

function DockItem({ icon, label, open, onClick }: DockItemProps): ReactNode {
  return (
    <button
      type="button"
      className={cx(styles.item, open && styles.itemOpen)}
      aria-pressed={open}
      onClick={onClick}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden>
        <path d={ICON_PATHS[icon]} />
      </svg>
      <span className={cx(styles.label, label.glyph !== null && styles.labelAccent)}>
        {label.text}
        {label.glyph !== null && <span aria-hidden> {label.glyph}</span>}
      </span>
    </button>
  );
}

export type DockProps = {
  readonly timeOpen: boolean;
  readonly layersOpen: boolean;
  readonly timeLabel: DockTimeLabel;
  readonly onHome: () => void;
  readonly onSearch: () => void;
  readonly onTime: () => void;
  readonly onLayers: () => void;
};

function Dock({
  timeOpen,
  layersOpen,
  timeLabel,
  onHome,
  onSearch,
  onTime,
  onLayers,
}: DockProps): ReactNode {
  return (
    <nav className={styles.root} aria-label="Dock">
      <DockItem icon="home" label={{ text: 'Home', glyph: null }} onClick={onHome} />
      <DockItem icon="search" label={{ text: 'Search', glyph: null }} onClick={onSearch} />
      <DockItem icon="time" label={timeLabel} open={timeOpen} onClick={onTime} />
      <DockItem
        icon="layers"
        label={{ text: 'Layers', glyph: null }}
        open={layersOpen}
        onClick={onLayers}
      />
    </nav>
  );
}

export default Dock;
