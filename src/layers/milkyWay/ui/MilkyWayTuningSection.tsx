/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's tuning knobs via the shared `DebugTuningSection` board. Dev-only;
 * the explorer-facing SettingsPanel surfaces only the visibility toggle.
 * The copy button promotes a tuned session to code via
 * `formatMilkyWayTuningDefaults`.
 */

import type { ReactElement } from 'react';
import type { MilkyWaySettings } from '../../../@types/settings/MilkyWaySettings';
import type { MilkyWayTuning } from '../../../@types/settings/MilkyWayTuning';
import {
  MILKY_WAY_SLIDER_FIELDS,
  milkyWaySliderPatch,
} from '../../../data/milkyWay/milkyWaySliderFields';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { formatMilkyWayTuningDefaults } from './formatMilkyWayTuningDefaults';
import CopyButton from '../../../components/common/CopyButton/CopyButton';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';

export type MilkyWayTuningSectionProps = {
  milkyWay: MilkyWaySettings;
  onChange: (patch: Partial<MilkyWayTuning>) => void;
};

export function MilkyWayTuningSection({
  milkyWay,
  onChange,
}: MilkyWayTuningSectionProps): ReactElement {
  const diff = formatMilkyWayTuningDefaults(milkyWay, MILKY_WAY_TUNING_DEFAULTS);
  return (
    <DebugTuningSection
      title="Milky Way tuning"
      fields={MILKY_WAY_SLIDER_FIELDS}
      values={milkyWay}
      onSliderChange={(k, v) => onChange(milkyWaySliderPatch(k, v))}
    >
      <CopyButton
        text={diff}
        label="Copy changed defaults"
        title="Paste into MILKY_WAY_TUNING_DEFAULTS in milkyWayCalibration.ts"
      />
    </DebugTuningSection>
  );
}
