/**
 * FlowRow — the explorer-facing controls for the CF4++ peculiar-velocity
 * flow-field overlay, living in the body of the SettingsPanel's "Flow"
 * section.
 *
 * Layout (a single labelled-slider row, mirroring the Cosmic web body):
 *
 *   [Intensity ━━━━━━━●━━━━━━━━━━━━━ 0.70]
 *
 * The enable toggle is NOT here — it lives on the section header as the
 * `CollapsibleSection`'s `headerToggle`, exactly like the Galaxies / Cosmic
 * web / Structures / Labels masters, so every section's on/off sits on the
 * same line. This row renders only the look controls and greys them out when
 * the layer is off (`enabled === false`).
 *
 * What each control does:
 *   - The intensity slider is the pre-blend ribbon brightness multiplier in
 *     [0, 1]. It does NOT change motion — only how strongly the layer reads
 *     against the galaxy points underneath.
 *
 * The slider is disabled when the layer is off: tuning a hidden overlay has
 * no visible effect and the greyed-out control signals "enable first"
 * without hiding the knob entirely.
 *
 * The remaining flow knobs (mode / count / trail / speed / density bias /
 * wander) are power-user tunables and live in the DebugPanel, not here — the
 * explorer surface stays to the one control that changes the look at a
 * glance. (Integration mode — 'advect' drifting ribbons vs 'streamline'
 * static curves with a travelling pulse — defaults to 'advect' and is only
 * reachable via the DebugPanel, state, or URL/tour, not this panel.)
 */
import type { ReactNode } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flow/flowFields';
import Slider from '../common/Slider/Slider';
import styles from './FlowRow.module.css';

export type FlowRowProps = {
  flow: FlowSettings;
  onChange: (patch: Partial<FlowFieldDefaults>) => void;
};

/** The slider knobs that surface in the explorer panel (just intensity today). */
const PANEL_SLIDERS = FLOW_SLIDER_FIELDS.filter((f) => f.surface === 'panel');

function FlowRow({ flow, onChange }: FlowRowProps): ReactNode {
  const { enabled } = flow;
  return (
    <div className={styles.row}>
      {/* Panel-surface sliders (intensity today) — driven from the flow field
          registry so ranges/labels live in one place.  Disabled while the layer
          is off (no visible effect).  Compact `Slider` folds label + value
          readout into one pill (see common/Slider/Slider.tsx). */}
      {PANEL_SLIDERS.map((f) => (
        <div className={styles.sliderRow} key={f.key} title={f.title}>
          <Slider
            label={f.label}
            value={flow[f.key]}
            min={f.min}
            max={f.max}
            step={f.step}
            disabled={!enabled}
            format={f.format}
            onChange={(v) => onChange(flowSliderPatch(f.key, v))}
          />
        </div>
      ))}
    </div>
  );
}

export default FlowRow;
