// src/components/DebugPanel/MilkyWayTuningSection.tsx
/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's tuning knobs (look + the perf levers that trade against it), rows
 * driven from `MILKY_WAY_SLIDER_FIELDS` so the field list, ranges, and value
 * formatting live in one registry rather than re-spelled here. Dev-only; the
 * explorer-facing SettingsPanel surfaces only the visibility toggle.
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
import DebugSection from './DebugSection';
import DebugSlider from './DebugSlider';

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
    <DebugSection title="Milky Way tuning">
      {MILKY_WAY_SLIDER_FIELDS.map((f) => (
        <DebugSlider
          key={f.key}
          label={f.label}
          value={milkyWay[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          readout={f.format(milkyWay[f.key])}
          title={f.title}
          onChange={(v) => onChange(milkyWaySliderPatch(f.key, v))}
        />
      ))}
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
    </DebugSection>
  );
}
