/**
 * Dock — the phone's bottom navigation: Home, Search, Time, Layers and About, each
 * with an icon and a visible label. Presentational: which panels are open and
 * the Time label arrive as props; taps leave as callbacks. Time and Layers are
 * toggles; Home, Search and About are one-shot actions (see DockItem).
 */

import type { ReactNode, Ref } from 'react';
import type { DockTimeLabel } from '../../@types/time/DockTimeLabel';
import DockItem from './DockItem';
import HomeIcon from '../icons/HomeIcon/HomeIcon';
import InfoIcon from '../icons/InfoIcon/InfoIcon';
import LayersIcon from '../icons/LayersIcon/LayersIcon';
import SearchIcon from '../icons/SearchIcon/SearchIcon';
import TimeIcon from '../icons/TimeIcon/TimeIcon';
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
      <DockItem icon={HomeIcon} label="Home" onClick={onHome} />
      <DockItem icon={SearchIcon} label="Search" onClick={onSearch} buttonRef={searchRef} />
      <DockItem
        icon={TimeIcon}
        label={timeLabel.text}
        glyph={timeLabel.glyph}
        name={timeLabel.name}
        open={timeOpen}
        onClick={onTime}
      />
      <DockItem
        icon={LayersIcon}
        label="Layers"
        open={layersOpen}
        onClick={onLayers}
        buttonRef={layersRef}
      />
      <DockItem icon={InfoIcon} label="About" name="About skymap" onClick={onAbout} />
    </nav>
  );
}

export default Dock;
