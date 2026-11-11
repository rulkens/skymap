/** SatelliteColorsSection: one colour row per satellite group, dev-only. Colour is the only knob. */

import type { ReactElement } from 'react';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteColors } from '../../@types/SatelliteColors';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';
import { formatSatelliteColorDefaults } from '../utils/formatSatelliteColorDefaults';
import Button from '../../../../components/common/Button/Button';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugSection from '../../../../components/DebugPanel/DebugSection';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';

export type SatelliteColorsSectionProps = {
  readonly colors: SatelliteColors;
  readonly onChange: (id: SatelliteProfileId, color: Vec3) => void;
  readonly onReset: () => void;
};

function SatelliteColorsSection({
  colors,
  onChange,
  onReset,
}: SatelliteColorsSectionProps): ReactElement {
  return (
    <DebugSection title="Satellite colours">
      {SATELLITE_PROFILES.map(({ id, label }) => (
        <DebugColorRow
          key={id}
          label={label}
          value={colors[id]}
          onChange={(color) => onChange(id, color)}
        />
      ))}
      <div className={debugStyles.buttonRow}>
        <Button onClick={onReset}>Reset colours</Button>
        <CopyButton
          text={formatSatelliteColorDefaults(colors)}
          label="Copy changed colours"
          title="Changed rows, ready to paste into SATELLITE_PROFILES"
        />
      </div>
    </DebugSection>
  );
}

export default SatelliteColorsSection;
