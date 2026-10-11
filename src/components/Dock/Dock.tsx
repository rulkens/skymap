/**
 * Dock — the phone's bottom navigation: Controls, Time, Layers, each with an icon
 * and a visible label. Presentational: which items are open and the Time label
 * arrive as props; taps leave as callbacks. An open item is marked by an
 * indicator bar, not colour alone.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';
import styles from './Dock.module.css';

// 24-unit stroke icons, one path each.
const ICON_PATHS = {
  controls: 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3',
  time: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
} as const;

type DockItemProps = {
  readonly icon: keyof typeof ICON_PATHS;
  readonly label: DockTimeLabel;
  readonly open: boolean;
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
  readonly controlsOpen: boolean;
  readonly timeOpen: boolean;
  readonly layersOpen: boolean;
  readonly timeLabel: DockTimeLabel;
  readonly onControls: () => void;
  readonly onTime: () => void;
  readonly onLayers: () => void;
};

function Dock({
  controlsOpen,
  timeOpen,
  layersOpen,
  timeLabel,
  onControls,
  onTime,
  onLayers,
}: DockProps): ReactNode {
  return (
    <nav className={styles.root} aria-label="Dock">
      <DockItem
        icon="controls"
        label={{ text: 'Controls', glyph: null }}
        open={controlsOpen}
        onClick={onControls}
      />
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
