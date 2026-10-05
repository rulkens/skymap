/**
 * CosmicWebDensitySection — presentational SettingsPanel section: a master
 * toggle on the header and one enable checkbox per registered field
 * (every `COSMIC_WEB_DENSITY_SOURCE_ROWS` entry). Props-driven, no internal
 * state; `memo`'d so an unrelated parent re-render bails on the prop-compare.
 */

import { memo } from 'react';
import type { CosmicWebDensitySettings } from '../@types/CosmicWebDensitySettings';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';
import CollapsibleSection from '../../../components/SettingsPanel/CollapsibleSection';
import styles from '../../../components/SettingsPanel/SettingsPanel.module.css';

export type CosmicWebDensitySectionProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  items: CosmicWebDensitySettings['items'];
  onRowEnabledChange: (id: CosmicWebDensityFieldId, enabled: boolean) => void;
};

function CosmicWebDensitySection({
  enabled,
  onEnabledChange,
  items,
  onRowEnabledChange,
}: CosmicWebDensitySectionProps) {
  return (
    <CollapsibleSection
      title="Cosmic web density"
      headerToggle={enabled}
      onHeaderToggleChange={onEnabledChange}
    >
      {COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => (
        <div className={styles.panelRow} key={entry.id}>
          <label htmlFor={`toggle-cosmic-web-density-${entry.id}`}>{entry.label}</label>
          <input
            id={`toggle-cosmic-web-density-${entry.id}`}
            type="checkbox"
            className={styles.toggle}
            checked={items[entry.id].enabled}
            onChange={(e) => onRowEnabledChange(entry.id, e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(CosmicWebDensitySection);
