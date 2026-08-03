// src/components/DebugPanel/MilkyWayTuningSection.tsx
/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's tuning knobs — its look (starSize / exposure / pxMin / pxMax /
 * softness) and the two perf levers that trade against it (lod / divisor).
 *
 * These decide whether the generated cloud reads as a smooth galaxy or as a
 * field of visible particles, and the answer is only findable by moving them
 * against a live frame — several were previously URL query params, which
 * meant a reload (and a fresh judgement of the previous look from memory) per
 * guess. The explorer-facing SettingsPanel surfaces only the Milky-Way
 * visibility toggle; everything here is dev-only.
 *
 * The rows are driven from `MILKY_WAY_SLIDER_FIELDS`, so the field list,
 * ranges, and value formatting live in one registry rather than re-spelled
 * here. That includes the star COUNT (`starCount`): it feeds generation
 * rather than a uniform, so `runFrame` answers a drag by regenerating the
 * cloud outright — see that registry's docblock for why the row still counts
 * as "changes the next frame" despite the heavier reaction.
 *
 * A copy-to-clipboard button sits under the sliders for promoting a tuned
 * session to code: `formatMilkyWayTuningDefaults` diffs the live values
 * against `MILKY_WAY_TUNING_DEFAULTS` and the button copies the paste-ready
 * lines. Imported straight from `services/engine/galaxyGenerator/v1/` rather than routed
 * through the container — it's a module constant, not store state, and the
 * established precedent here (`AssetLoadingSection`, `GpuTimingsSection`,
 * `RenderTogglesSection`) is that presentational DebugPanel sections import
 * from `services/` directly when the value in question isn't part of the
 * store.
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
