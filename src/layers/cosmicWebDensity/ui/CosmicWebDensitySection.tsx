/**
 * CosmicWebDensitySection — presentational SettingsPanel section: a master
 * toggle on the header and one enable checkbox per registered field
 * (every `COSMIC_WEB_DENSITY_SOURCE_ROWS` entry). Per-field intensity /
 * contrast / trim / density / exposure / palette knobs live in the
 * DebugPanel's tuning section, not here. Props-driven, no internal state;
 * `memo`'d so an unrelated parent re-render bails on the prop-compare.
 */

import { memo } from 'react';
import type { VolumeFieldRowData } from '../@types/VolumeFieldRowData';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import CollapsibleSection from '../../../components/SettingsPanel/CollapsibleSection';
import styles from '../../../components/SettingsPanel/SettingsPanel.module.css';

export type CosmicWebDensitySectionProps = {
  /** False short-circuits both volume passes before any GPU cost. */
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** One row per registered field, in `COSMIC_WEB_DENSITY_SOURCE_ROWS` order. */
  rows: ReadonlyArray<VolumeFieldRowData>;
  onRowEnabledChange: (id: CosmicWebDensityFieldId, enabled: boolean) => void;
};

function CosmicWebDensitySection({
  enabled,
  onEnabledChange,
  rows,
  onRowEnabledChange,
}: CosmicWebDensitySectionProps) {
  return (
    <CollapsibleSection
      title="Cosmic web density"
      headerToggle={enabled}
      onHeaderToggleChange={onEnabledChange}
    >
      {rows.map((row) => (
        <div className={styles.panelRow} key={row.id}>
          <label htmlFor={`toggle-cosmic-web-density-${row.id}`}>{row.label}</label>
          <input
            id={`toggle-cosmic-web-density-${row.id}`}
            type="checkbox"
            className={styles.toggle}
            checked={row.enabled}
            onChange={(e) => onRowEnabledChange(row.id, e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(CosmicWebDensitySection);
