/**
 * LensingTuningSection — DebugPanel subsection for the gravitational-lensing
 * prototype.
 *
 * Exposes the knobs of the vertex-stage lens: a master on/off, the SIS↔NFW
 * profile toggle, the exaggerated peak deflection in degrees, and (NFW only)
 * the scale radius r_s that sets where the ring sits. The lens centre is not
 * a knob — it always tracks the camera orbit target (the thing you've zoomed
 * into), so the workflow is "orbit a cluster, flip this on, watch the
 * background bend".
 *
 * Lives in the DebugPanel rather than the explorer-facing SettingsPanel
 * because it is a physics experiment: the strength is wildly exaggerated vs.
 * reality (real cluster Einstein radii are ~arcseconds), and it distorts the
 * view around whatever you orbit. Idiom matches the sibling sections — a
 * default-closed `<details>` with inline monospace styles and a local
 * `Slider`. The r_s slider is hidden in SIS mode, where it has no effect.
 */

import type { ReactElement } from 'react';
import type { LensMode } from '../../@types/settings/LensMode';

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
  mode: LensMode;
  strengthDeg: number;
  scaleRadiusMpc: number;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: LensMode) => void;
  onStrengthDegChange: (deg: number) => void;
  onScaleRadiusMpcChange: (mpc: number) => void;
};

export function LensingTuningSection({
  enabled,
  mode,
  strengthDeg,
  scaleRadiusMpc,
  onEnabledChange,
  onModeChange,
  onStrengthDegChange,
  onScaleRadiusMpcChange,
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

        {/* Profile toggle. Two radios rather than a select — only two modes,
            and the labels carry the one-word distinction. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <span style={{ flex: '0 0 90px' }}>Profile</span>
          {(['sis', 'nfw'] as const).map((m) => (
            <label
              key={m}
              style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="lens-mode"
                checked={mode === m}
                onChange={() => onModeChange(m)}
              />
              <span>{m.toUpperCase()}</span>
            </label>
          ))}
        </div>

        <Slider
          label="Peak deflection"
          value={strengthDeg}
          min={0}
          max={15}
          step={0.1}
          readout={`${strengthDeg.toFixed(1)}°`}
          onChange={onStrengthDegChange}
        />

        {/* r_s only shapes the NFW profile; hide it in SIS mode to avoid
            implying it does anything there. */}
        {mode === 'nfw' && (
          <Slider
            label="Scale radius"
            value={scaleRadiusMpc}
            min={0.1}
            max={10}
            step={0.1}
            readout={`${scaleRadiusMpc.toFixed(1)} Mpc`}
            onChange={onScaleRadiusMpcChange}
          />
        )}
      </div>
    </details>
  );
}
