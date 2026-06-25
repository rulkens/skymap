/**
 * FlowTuningSection — DebugPanel subsection exposing the CF4++ flow-field's
 * power-user motion knobs (count / trail / flowSpeed / densityBias / wander /
 * edgeFade).  The explorer-facing SettingsPanel surfaces only the "look"
 * controls (enabled / mode / intensity); these tunables shape the underlying
 * particle motion and are dev-only — handy when calibrating the advect look but
 * too fiddly for the main panel.
 *
 * The rows are driven from `FLOW_SLIDER_FIELDS` (the `'debug'` surface), so the
 * field list, ranges, and value formatting live in one registry rather than
 * re-spelled here.  Each slider owns its `max`; a new debug knob is one registry row.
 *
 * Idiom: a default-closed `<details>` with inline monospace styles (no
 * `.module.css`), matching the other DebugPanel sections.  The shared
 * `DebugSlider` component DRYs the labelled rows.
 */

import type { ReactElement } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import { DebugSlider } from './DebugSlider';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flow/flowFields';

export type FlowTuningSectionProps = {
  flow: FlowSettings;
  onChange: (patch: Partial<FlowSettings>) => void;
};

/** The flow knobs that surface in the dev panel. */
const DEBUG_SLIDERS = FLOW_SLIDER_FIELDS.filter((f) => f.surface === 'debug');

export function FlowTuningSection({ flow, onChange }: FlowTuningSectionProps): ReactElement {
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Flow tuning</summary>
      <div style={{ marginTop: 4 }}>
        {DEBUG_SLIDERS.map((f) => (
          <DebugSlider
            key={f.key}
            label={f.label}
            value={flow[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            readout={f.format(flow[f.key])}
            onChange={(v) => onChange(flowSliderPatch(f.key, v))}
          />
        ))}
      </div>
    </details>
  );
}
