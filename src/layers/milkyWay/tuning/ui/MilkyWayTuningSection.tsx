/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's tuning knobs via the shared `DebugTuningSection` board. Dev-only;
 * the explorer-facing SettingsPanel surfaces only the visibility toggle.
 * The copy button promotes a tuned session to code via
 * `formatMilkyWayCloudTuningDefaults`.
 */

import type { ReactElement } from 'react';
import type { MilkyWaySettings } from '../../@types/MilkyWaySettings';
import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';
import {
  MILKY_WAY_CLOUD_SLIDER_FIELDS,
  milkyWayCloudSliderPatch,
} from '../data/milkyWayCloudSliderFields';
import { MILKY_WAY_CLOUD_TUNING_DEFAULTS } from '../../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { formatMilkyWayCloudTuningDefaults } from '../utils/formatMilkyWayCloudTuningDefaults';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';

export type MilkyWayTuningSectionProps = {
  milkyWay: MilkyWaySettings;
  onChange: (patch: Partial<MilkyWayCloudTuning>) => void;
};

export function MilkyWayTuningSection({
  milkyWay,
  onChange,
}: MilkyWayTuningSectionProps): ReactElement {
  const diff = formatMilkyWayCloudTuningDefaults(milkyWay.cloud, MILKY_WAY_CLOUD_TUNING_DEFAULTS);
  return (
    <DebugTuningSection
      title="Milky Way tuning"
      fields={MILKY_WAY_CLOUD_SLIDER_FIELDS}
      values={milkyWay.cloud}
      onSliderChange={(k, v) => onChange(milkyWayCloudSliderPatch(k, v))}
    >
      <CopyButton
        text={diff}
        label="Copy changed defaults"
        title="Paste into MILKY_WAY_CLOUD_TUNING_DEFAULTS in milkyWayCalibration.ts"
      />
    </DebugTuningSection>
  );
}
