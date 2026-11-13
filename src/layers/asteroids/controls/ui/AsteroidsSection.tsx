/**
 * AsteroidsSection — the Settings panel's asteroids group: the master switch on the header, one
 * switch per class and the Layer's own brightness. A pure function of props, like
 * `SatellitesSection`; the master shows "mixed" while it is on and some class is off.
 */

import { memo } from 'react';
import CollapsibleSection from '../../../../components/SettingsPanel/CollapsibleSection';
import Slider from '../../../../components/common/Slider/Slider';
import styles from '../../../../components/SettingsPanel/SettingsPanel.module.css';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_LABELS } from '../data/asteroidClassLabels';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidsSettings } from '../../@types/AsteroidsSettings';

type AsteroidsSectionProps = {
  title: string;
  enabled: boolean;
  items: AsteroidsSettings['items'];
  brightness: number;
  onToggleMaster: (enabled: boolean) => void;
  onToggleClass: (cls: AsteroidClass, enabled: boolean) => void;
  onBrightnessChange: (v: number) => void;
};

function AsteroidsSection({
  title,
  enabled,
  items,
  brightness,
  onToggleMaster,
  onToggleClass,
  onBrightnessChange,
}: AsteroidsSectionProps) {
  const allEnabled = ASTEROID_CLASSES.every((cls) => items[cls].enabled);
  return (
    <CollapsibleSection
      title={title}
      headerToggle={enabled}
      headerToggleIndeterminate={enabled && !allEnabled}
      onHeaderToggleChange={onToggleMaster}
    >
      {ASTEROID_CLASSES.map((cls) => (
        <div className={styles.panelRow} key={cls}>
          <label htmlFor={`toggle-asteroid-class-${cls}`}>{ASTEROID_CLASS_LABELS[cls]}</label>
          <input
            id={`toggle-asteroid-class-${cls}`}
            type="checkbox"
            className={styles.toggle}
            checked={items[cls].enabled}
            onChange={(e) => onToggleClass(cls, e.target.checked)}
          />
        </div>
      ))}
      <div className={styles.panelRow}>
        <Slider
          label="Brightness"
          value={brightness}
          min={0.01}
          max={4}
          step={0.05}
          onChange={onBrightnessChange}
          format={(v) => `${v.toFixed(1)}×`}
        />
      </div>
    </CollapsibleSection>
  );
}

export default memo(AsteroidsSection);
