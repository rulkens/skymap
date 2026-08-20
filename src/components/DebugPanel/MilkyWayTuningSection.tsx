// src/components/DebugPanel/MilkyWayTuningSection.tsx
/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's tuning knobs (look + the perf levers that trade against it),
 * instantiating the shared `DebugTuningSection` board with
 * `MILKY_WAY_SLIDER_FIELDS`. Dev-only; the explorer-facing SettingsPanel
 * surfaces only the visibility toggle.
 *
 * The copy-to-clipboard button promotes a tuned session to code:
 * `formatMilkyWayTuningDefaults` diffs the live values against
 * `MILKY_WAY_TUNING_DEFAULTS` for paste-ready lines. Imported straight from
 * `services/` rather than routed through the container, matching
 * `AssetLoadingSection` / `GpuTimingsSection` / `RenderTogglesSection`: a
 * presentational DebugPanel section reads a module constant directly when
 * it isn't store state.
 */

import type { ReactElement } from 'react';
import type { MilkyWaySettings } from '../../@types/settings/MilkyWaySettings';
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import {
  MILKY_WAY_SLIDER_FIELDS,
  milkyWaySliderPatch,
} from '../../data/milkyWay/milkyWaySliderFields';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { formatMilkyWayTuningDefaults } from '../../utils/format/formatMilkyWayTuningDefaults';
import CopyButton from '../common/CopyButton/CopyButton';
import DebugTuningSection from './DebugTuningSection';

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
      {
        // CopyButton itself disables on an empty `text` — nothing else to
        // decide here beyond feeding it the diff. That reads correctly at
        // rest (no session yet) and after every knob is reset back to its
        // default, not just as an initial state.
      }
      <CopyButton
        text={diff}
        label="Copy changed defaults"
        title="Paste into MILKY_WAY_TUNING_DEFAULTS in milkyWayCalibration.ts"
      />
    </DebugTuningSection>
  );
}
