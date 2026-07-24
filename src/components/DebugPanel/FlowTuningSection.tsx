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
 * Idiom: a default-closed `DebugSection` with a local `Slider` component that
 * DRYs the labelled rows.
 */

import type { ReactElement } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flow/flowFields';
import DebugSection from './DebugSection';
import styles from './FlowTuningSection.module.css';

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Pre-formatted value readout (e.g. `toFixed(3)` or an integer string). */
  readout: string;
  onChange: (v: number) => void;
};

function Slider({ label, value, min, max, step, readout, onChange }: SliderProps): ReactElement {
  return (
    <div className={styles.root}>
      <span className={styles.label}>{label}</span>
      <span className={styles.readout}>{readout}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
      />
    </div>
  );
}

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
        <Slider
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
    </DebugSection>
  );
}
