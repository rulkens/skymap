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
 * Idiom: a default-closed `DebugSection` filled with `DebugSlider` rows — the
 * shared row shape every dev-panel tuning section uses.
 */

import type { ReactElement } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flow/flowFields';
import DebugSection from './DebugSection';
import DebugSlider from './DebugSlider';

export type FlowTuningSectionProps = {
  flow: FlowSettings;
  onChange: (patch: Partial<FlowFieldDefaults>) => void;
};

/** The flow knobs that surface in the dev panel. */
const DEBUG_SLIDERS = FLOW_SLIDER_FIELDS.filter((f) => f.surface === 'debug');

export function FlowTuningSection({ flow, onChange }: FlowTuningSectionProps): ReactElement {
  return (
    <DebugSection title="Flow tuning">
      {DEBUG_SLIDERS.map((f) => (
        <DebugSlider
          key={f.key}
          label={f.label}
          value={flow[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          readout={f.format(flow[f.key])}
          title={f.title}
          onChange={(v) => onChange(flowSliderPatch(f.key, v))}
        />
      ))}
    </DebugSection>
  );
}
