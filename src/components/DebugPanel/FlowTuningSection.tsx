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
 * Idiom: an instantiation of the shared `DebugTuningSection` board — the same
 * shape every dev-panel tuning section uses.
 */

import type { ReactElement } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flow/flowFields';
import DebugTuningSection from './DebugTuningSection';

export type FlowTuningSectionProps = {
  flow: FlowSettings;
  onChange: (patch: Partial<FlowFieldDefaults>) => void;
};

/** The flow knobs that surface in the dev panel. */
const DEBUG_SLIDERS = FLOW_SLIDER_FIELDS.filter((f) => f.surface === 'debug');

export function FlowTuningSection({ flow, onChange }: FlowTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Flow tuning"
      fields={DEBUG_SLIDERS}
      values={flow}
      onSliderChange={(k, v) => onChange(flowSliderPatch(k, v))}
    />
  );
}
