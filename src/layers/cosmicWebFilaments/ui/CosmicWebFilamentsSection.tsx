/**
 * CosmicWebFilamentsSection — presentational SettingsPanel section for the
 * DisPerSE cosmic-web skeleton overlay: a master enable toggle on the header
 * and an intensity slider shown while the layer is on.
 *
 * Props-driven, no internal state: imports nothing from `store/` or
 * `state/`. `memo`'d so an unrelated parent re-render bails on the
 * prop-compare instead of re-rendering this section.
 */

import { memo } from 'react';
import CollapsibleSection from '../../../components/SettingsPanel/CollapsibleSection';
import Slider from '../../../components/common/Slider/Slider';
import styles from '../../../components/SettingsPanel/SettingsPanel.module.css';

export type CosmicWebFilamentsSectionProps = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  intensity: number;
  onIntensityChange: (value: number) => void;
};

function CosmicWebFilamentsSection({
  enabled,
  onEnabledChange,
  intensity,
  onIntensityChange,
}: CosmicWebFilamentsSectionProps) {
  return (
    <CollapsibleSection
      title="Cosmic web filaments"
      headerToggle={enabled}
      onHeaderToggleChange={onEnabledChange}
    >
      {/* Shown only while the layer is on — the slider would have no
          visible effect otherwise. */}
      {enabled && (
        <div className={styles.panelRow}>
          <Slider
            label="Intensity"
            value={intensity}
            min={0}
            max={1}
            step={0.05}
            onChange={onIntensityChange}
            format={(v) => v.toFixed(2)}
          />
        </div>
      )}
    </CollapsibleSection>
  );
}

export default memo(CosmicWebFilamentsSection);
