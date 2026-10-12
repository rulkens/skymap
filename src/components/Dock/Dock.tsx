/**
 * Dock — the phone's bottom navigation: Home, Search, Time, Layers and About, each
 * with an icon and a visible label. Presentational: which panels are open and
 * the Time label arrive as props; taps leave as callbacks. Time and Layers are
 * toggles; Home, Search and About are one-shot actions (see DockItem).
 */

import type { ReactNode, Ref } from 'react';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';
import DockItem from './DockItem';
import styles from './Dock.module.css';

export type DockProps = {
  readonly timeOpen: boolean;
  readonly layersOpen: boolean;
  readonly timeLabel: DockTimeLabel;
  readonly onHome: () => void;
  readonly onSearch: () => void;
  readonly onTime: () => void;
  readonly onLayers: () => void;
  readonly onAbout: () => void;
  readonly searchRef?: Ref<HTMLButtonElement>;
  readonly layersRef?: Ref<HTMLButtonElement>;
};

function Dock({
  timeOpen,
  layersOpen,
  timeLabel,
  onHome,
  onSearch,
  onTime,
  onLayers,
  onAbout,
  searchRef,
  layersRef,
}: DockProps): ReactNode {
  return (
    <nav className={styles.root} aria-label="Dock">
      <DockItem icon="home" label="Home" onClick={onHome} />
      <DockItem icon="search" label="Search" onClick={onSearch} buttonRef={searchRef} />
      <DockItem
        icon="time"
        label={timeLabel.text}
        glyph={timeLabel.glyph}
        name={timeLabel.name}
        open={timeOpen}
        onClick={onTime}
      />
      <DockItem
        icon="layers"
        label="Layers"
        open={layersOpen}
        onClick={onLayers}
        buttonRef={layersRef}
      />
      <DockItem icon="about" label="About" name="About skymap" onClick={onAbout} />
    </nav>
  );
}

export default Dock;
