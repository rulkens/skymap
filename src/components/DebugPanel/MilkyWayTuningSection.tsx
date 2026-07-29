// src/components/DebugPanel/MilkyWayTuningSection.tsx
/**
 * MilkyWayTuningSection — DebugPanel subsection exposing the Milky-Way star
 * cloud's look knobs (starSize / exposure / pxMin / pxMax / softness / lod).
 *
 * These decide whether the generated cloud reads as a smooth galaxy or as a
 * field of visible particles, and the answer is only findable by moving them
 * against a live frame — they were previously URL query params, which meant a
 * reload (and a fresh judgement of the previous look from memory) per guess.
 * The explorer-facing SettingsPanel surfaces only the Milky-Way visibility
 * toggle; everything here is dev-only.
 *
 * The rows are driven from `MILKY_WAY_SLIDER_FIELDS`, so the field list,
 * ranges, and value formatting live in one registry rather than re-spelled
 * here. The star COUNT is deliberately not a row: it feeds generation, not the
 * per-frame uniforms, so a slider over it would move nothing.
 */

import type { ReactElement } from 'react';
import type { MilkyWaySettings } from '../../@types/settings/MilkyWaySettings';
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import {
  MILKY_WAY_SLIDER_FIELDS,
  milkyWaySliderPatch,
} from '../../data/milkyWay/milkyWaySliderFields';
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
    </DebugSection>
  );
}
