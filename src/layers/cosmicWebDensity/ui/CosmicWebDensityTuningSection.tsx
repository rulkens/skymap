/**
 * CosmicWebDensityTuningSection — DebugPanel section listing every
 * registered cosmic-web density field's tuning knobs (intensity, contrast,
 * trim, density scale, exposure, palette). No enable checkbox here — that
 * lives in the SettingsPanel's main "Cosmic web density" section (spec §7).
 */

import type { ReactElement } from 'react';
import type { VolumeFieldRowData } from '../@types/VolumeFieldRowData';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import DebugSection from '../../../components/DebugPanel/DebugSection';
import DensityFieldTuningRow from './DensityFieldTuningRow';

export type CosmicWebDensityTuningSectionProps = {
  rows: ReadonlyArray<VolumeFieldRowData>;
  onChange: (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) => void;
};

function CosmicWebDensityTuningSection({
  rows,
  onChange,
}: CosmicWebDensityTuningSectionProps): ReactElement {
  return (
    <DebugSection title="Cosmic web density (tuning)">
      {rows.map((row) => (
        <DensityFieldTuningRow key={row.id} row={row} onChange={onChange} />
      ))}
    </DebugSection>
  );
}

export default CosmicWebDensityTuningSection;
