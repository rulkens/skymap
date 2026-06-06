/**
 * FlowTuningSection — DebugPanel subsection exposing the CF4++ flow-field's
 * power-user motion knobs.
 *
 * The explorer-facing SettingsPanel surfaces only the three "look" controls
 * (enabled / mode / intensity).  The five tunables here shape the underlying
 * particle motion and are dev-only — handy when calibrating the advect look but
 * too fiddly for the main panel:
 *
 *   - count        — particle population, i.e. how many of the storage buffers'
 *                    slots are filled.  Changing it reseeds the buffers
 *                    (handled engine-side by the handle's `setCount`).
 *   - trail        — ribbon ring spacing; longer ribbons read as faster streaks.
 *   - flowSpeed    — advect head distance per frame (how far the head advances).
 *   - densityBias  — density-weighted seeding selectivity (0 = uniform spawn,
 *                    1 = concentrate spawns in overdense regions).
 *   - wander       — per-step jitter added to the integrator; advect mode only.
 *
 * Idiom: a default-closed `<details>` with inline monospace styles (no
 * `.module.css`), matching the other DebugPanel sections.  A local `Slider`
 * component DRYs the five labelled rows.  Each slider owns its `max` (the
 * settingsTable applies floor-only clamps), so the count ceiling is
 * `MAX_PARTICLES` straight from the flow constants.
 */

import type { ReactElement } from 'react';
import { MAX_PARTICLES } from '../../services/gpu/renderers/flowFieldConstants';

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ flex: '0 0 90px' }}>{label}</span>
      <span style={{ flex: '0 0 52px', textAlign: 'right', opacity: 0.8 }}>{readout}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: '1 1 auto' }}
      />
    </div>
  );
}

export type FlowTuningSectionProps = {
  count: number;
  trail: number;
  flowSpeed: number;
  densityBias: number;
  wander: number;
  boundaryFadeWidth: number;
  onCountChange: (v: number) => void;
  onTrailChange: (v: number) => void;
  onFlowSpeedChange: (v: number) => void;
  onDensityBiasChange: (v: number) => void;
  onWanderChange: (v: number) => void;
  onBoundaryFadeWidthChange: (v: number) => void;
};

export function FlowTuningSection({
  count,
  trail,
  flowSpeed,
  densityBias,
  wander,
  boundaryFadeWidth,
  onCountChange,
  onTrailChange,
  onFlowSpeedChange,
  onDensityBiasChange,
  onWanderChange,
  onBoundaryFadeWidthChange,
}: FlowTuningSectionProps): ReactElement {
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Flow tuning</summary>
      <div style={{ marginTop: 4 }}>
        <Slider
          label="count"
          value={count}
          min={0}
          max={MAX_PARTICLES}
          step={500}
          readout={String(Math.round(count))}
          onChange={onCountChange}
        />
        <Slider
          label="trail"
          value={trail}
          min={0}
          max={0.02}
          step={0.001}
          readout={trail.toFixed(3)}
          onChange={onTrailChange}
        />
        <Slider
          label="flowSpeed"
          value={flowSpeed}
          min={0}
          max={0.5}
          step={0.005}
          readout={flowSpeed.toFixed(3)}
          onChange={onFlowSpeedChange}
        />
        <Slider
          label="densityBias"
          value={densityBias}
          min={0}
          max={1}
          step={0.01}
          readout={densityBias.toFixed(2)}
          onChange={onDensityBiasChange}
        />
        <Slider
          label="wander"
          value={wander}
          min={0}
          max={0.3}
          step={0.005}
          readout={wander.toFixed(3)}
          onChange={onWanderChange}
        />
        <Slider
          label="edgeFade"
          value={boundaryFadeWidth}
          min={0}
          max={0.5}
          step={0.01}
          readout={boundaryFadeWidth.toFixed(2)}
          onChange={onBoundaryFadeWidthChange}
        />
      </div>
    </details>
  );
}
