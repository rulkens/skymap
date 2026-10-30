/**
 * SatellitesSection — the Settings panel's satellites group: the master switch on the header and
 * one switch per class. A pure function of props, like `StarsSection`; the master shows
 * "mixed" while it is on and some class is off.
 */

import { memo } from 'react';
import CollapsibleSection from '../../../components/SettingsPanel/CollapsibleSection';
import styles from '../../../components/SettingsPanel/SettingsPanel.module.css';
import { SATELLITE_CLASSES } from '../../../data/satellites/satelliteClasses';
import { SATELLITE_CLASS_LABELS } from '../../../data/satellites/satelliteClassLabels';
import type { SatelliteClass } from '../../../@types/satellites/SatelliteClass';
import type { SatellitesSettings } from '../../../@types/settings/SatellitesSettings';

type SatellitesSectionProps = {
  enabled: boolean;
  items: SatellitesSettings['items'];
  onToggleMaster: (enabled: boolean) => void;
  onToggleClass: (cls: SatelliteClass, enabled: boolean) => void;
};

function SatellitesSection({
  enabled,
  items,
  onToggleMaster,
  onToggleClass,
}: SatellitesSectionProps) {
  const allEnabled = SATELLITE_CLASSES.every((cls) => items[cls].enabled);
  return (
    <CollapsibleSection
      title="Satellites"
      headerToggle={enabled}
      headerToggleIndeterminate={enabled && !allEnabled}
      onHeaderToggleChange={onToggleMaster}
    >
      {SATELLITE_CLASSES.map((cls) => (
        <div className={styles.panelRow} key={cls}>
          <label htmlFor={`toggle-satellite-class-${cls}`}>{SATELLITE_CLASS_LABELS[cls]}</label>
          <input
            id={`toggle-satellite-class-${cls}`}
            type="checkbox"
            className={styles.toggle}
            checked={items[cls].enabled}
            onChange={(e) => onToggleClass(cls, e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(SatellitesSection);
