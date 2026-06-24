/**
 * LensingTuningSection — DebugPanel subsection for the gravitational-lensing
 * prototype.
 *
 * Exposes the knobs of the vertex-stage lens: a master on/off, the SIS↔NFW
 * profile toggle, and a log-scaled dimensionless strength multiplier (0 = off,
 * 1 = physical, ~1000 = wildly exaggerated for visual debugging). The lens
 * centre is not a knob — it always tracks the camera orbit target (the thing
 * you've zoomed into), so the workflow is "orbit a cluster, flip this on,
 * watch the background bend".
 *
 * The strength knob is linear in log-space: p = 0.25 is the physical 1× point,
 * and the full four-decade range [0.1, 1000] is reachable without the low end
 * becoming invisibly thin. p = 0 is a hard sentinel that disables the effect
 * entirely (the shader multiplies by 0 → no deflection).
 *
 * NFW scale radius r_s is no longer a UI knob — it is derived per-cluster from
 * R500/c500 in the build pipeline, so rings on different clusters will differ
 * in size automatically. This section therefore drops the scale-radius slider
 * that existed when r_s was a single global constant.
 *
 * Lives in the DebugPanel rather than the explorer-facing SettingsPanel
 * because it is a physics experiment: real cluster Einstein radii are
 * ~arcseconds, and the exaggerated mode distorts the view around whatever you
 * orbit. Idiom matches the sibling sections — a default-closed `<details>` with
 * inline monospace styles and the shared `DebugSlider`.
 */

import type { ReactElement } from 'react';
import type { LensMode } from '../../@types/settings/LensMode';
import { DebugSlider } from './DebugSlider';
import { lensStrengthFromSlider } from '../../utils/lensing/lensStrengthFromSlider';
import { lensSliderFromStrength } from '../../utils/lensing/lensSliderFromStrength';

// Format the strength multiplier for the readout label.
// Small values (< 10) get one decimal place; larger values are rounded.
function formatStrength(s: number): string {
  if (s < 10) return `${s.toFixed(1)}×`;
  return `${Math.round(s)}×`;
}

export type LensingTuningSectionProps = {
  enabled: boolean;
  mode: LensMode;
  lensStrength: number;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: LensMode) => void;
  onLensStrengthChange: (strength: number) => void;
};

export function LensingTuningSection({
  enabled,
  mode,
  lensStrength,
  onEnabledChange,
  onModeChange,
  onLensStrengthChange,
}: LensingTuningSectionProps): ReactElement {
  const strengthReadout = lensStrength <= 0 ? 'off' : formatStrength(lensStrength);

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

        {/* Log-scaled dimensionless strength. p = 0.25 is the physical 1× point;
            p = 0 is hard-off (slider left edge). The readout shows the multiplier
            so it is clear how far past physical the user has dialled. */}
        <DebugSlider
          label="Strength"
          value={lensSliderFromStrength(lensStrength)}
          min={0}
          max={1}
          step={0.001}
          readout={strengthReadout}
          onChange={(p) => onLensStrengthChange(lensStrengthFromSlider(p))}
        />
      </div>
    </details>
  );
}
