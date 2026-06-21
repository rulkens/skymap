/**
 * LensingTuningSection — DebugPanel subsection for the gravitational-lensing
 * prototype.
 *
 * Exposes the two knobs of the SIS thin-lens effect: a master on/off and the
 * exaggerated Einstein-ring radius in degrees. The lens centre is not a knob —
 * it always tracks the camera orbit target (the thing you've zoomed into), so
 * the workflow is "orbit a cluster, flip this on, watch the background bend".
 *
 * Lives in the DebugPanel rather than the explorer-facing SettingsPanel because
 * it is a physics experiment: the strength is wildly exaggerated vs. reality
 * (real cluster Einstein radii are ~arcseconds), and it distorts the view
 * around whatever you orbit. Idiom matches the sibling sections — a default-
 * closed `<details>` with inline monospace styles and a local `Slider`.
 */

import type { ReactElement } from 'react';

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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

export type LensingTuningSectionProps = {
  enabled: boolean;
  strengthDeg: number;
  onEnabledChange: (enabled: boolean) => void;
  onStrengthDegChange: (deg: number) => void;
};

export function LensingTuningSection({
  enabled,
  strengthDeg,
  onEnabledChange,
  onStrengthDegChange,
}: LensingTuningSectionProps): ReactElement {
  return (
    <details>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>Gravitational lensing</summary>
      <div style={{ marginTop: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <span>Enabled (lens = orbit target)</span>
        </label>
        <Slider
          label="Einstein radius"
          value={strengthDeg}
          min={0}
          max={15}
          step={0.1}
          readout={`${strengthDeg.toFixed(1)}°`}
          onChange={onStrengthDegChange}
        />
      </div>
    </details>
  );
}
