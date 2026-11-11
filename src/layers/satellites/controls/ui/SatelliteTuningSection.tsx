/** SatelliteTuningSection: the ambient slider, then one colour row per satellite group, dev-only. */

import type { ReactElement } from 'react';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { SatelliteTuning } from '../../@types/SatelliteTuning';
import type { SatelliteProfileId } from '../../points/@types/SatelliteProfileId';
import { SATELLITE_PROFILES } from '../../points/data/satelliteProfiles';
import { SATELLITE_TUNING_SLIDER_FIELDS } from '../data/satelliteTuningSliderFields';
import { formatSatelliteColorDefaults } from '../utils/formatSatelliteColorDefaults';
import Button from '../../../../components/common/Button/Button';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';

export type SatelliteTuningSectionProps = {
  readonly tuning: SatelliteTuning;
  readonly onColorChange: (id: SatelliteProfileId, color: Vec3) => void;
  readonly onAmbientChange: (ambient: number) => void;
  readonly onReset: () => void;
};

function SatelliteTuningSection({
  tuning,
  onColorChange,
  onAmbientChange,
  onReset,
}: SatelliteTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Satellite tuning"
      fields={SATELLITE_TUNING_SLIDER_FIELDS}
      values={tuning}
      onSliderChange={(_key, value) => onAmbientChange(value)}
    >
      {SATELLITE_PROFILES.map(({ id, label }) => (
        <DebugColorRow
          key={id}
          label={label}
          value={tuning.colors[id]}
          onChange={(color) => onColorChange(id, color)}
        />
      ))}
      <div className={debugStyles.buttonRow}>
        <Button onClick={onReset}>Reset to defaults</Button>
        <CopyButton
          text={formatSatelliteColorDefaults(tuning.colors)}
          label="Copy changed colours"
          title="Changed rows, ready to paste into SATELLITE_PROFILES"
        />
      </div>
    </DebugTuningSection>
  );
}

export default SatelliteTuningSection;
