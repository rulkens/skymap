/**
 * CosmicWebDensityTuningSection — DebugPanel section listing every
 * registered cosmic-web density field's tuning knobs (intensity, contrast,
 * trim, density scale, exposure, palette). No enable checkbox here — that
 * lives in the SettingsPanel's main "Cosmic web density" section (spec §7).
 */

import type { ReactElement } from 'react';
import type { CosmicWebDensitySettings } from '../@types/CosmicWebDensitySettings';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';
import DebugSection from '../../../components/DebugPanel/DebugSection';
import DensityFieldTuningRow from './DensityFieldTuningRow';

export type CosmicWebDensityTuningSectionProps = {
  items: CosmicWebDensitySettings['items'];
  onChange: (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) => void;
};

function CosmicWebDensityTuningSection({
  items,
  onChange,
}: CosmicWebDensityTuningSectionProps): ReactElement {
  return (
    <DebugSection title="Cosmic web density (tuning)">
      {COSMIC_WEB_DENSITY_SOURCE_ROWS.map(([, entry]) => (
        <DensityFieldTuningRow
          key={entry.id}
          entry={entry}
          settings={items[entry.id]}
          onChange={onChange}
        />
      ))}
    </DebugSection>
  );
}

export default CosmicWebDensityTuningSection;
