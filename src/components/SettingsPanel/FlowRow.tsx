/**
 * FlowRow — the explorer-facing controls for the CF4++ peculiar-velocity
 * flow-field overlay, living in the SettingsPanel's "Flow" section.
 *
 * Layout (three visual regions, mirroring `VolumeFieldRow`):
 *
 *   [✓] Flow                                  (peculiar velocity)
 *       [ Advect ][ Streamline ]
 *       Intensity   0.70  [━━━━━━━━━━━●━━━━━━]
 *
 * What each control does:
 *   - The enable checkbox is the master gate. Flicking it on demand-loads the
 *     velocity cube (paid only on first enable) and fades the ribbons in.
 *   - The mode switch chooses the integration style: 'advect' (drifting
 *     ribbons — the hero look) vs 'streamline' (static curves with a
 *     travelling pulse). Switching mode reseeds the shared particle buffers,
 *     but that's handled engine-side; this row only emits the new mode.
 *   - The intensity slider is the pre-blend ribbon brightness multiplier in
 *     [0, 1]. It does NOT change motion — only how strongly the layer reads
 *     against the galaxy points underneath.
 *
 * The mode switch + slider are disabled when the layer is off: tuning a
 * hidden overlay has no visible effect and the greyed-out controls signal
 * "enable first" without hiding the knobs entirely.
 *
 * The remaining flow knobs (count / trail / speed / density bias / wander)
 * are power-user motion tunables and live in the DebugPanel, not here — the
 * explorer surface stays to the three controls that change the look at a
 * glance.
 */
import type { ReactNode } from 'react';
import type { FlowMode } from '../../@types/data/FlowMode';
import styles from './FlowRow.module.css';

export type FlowRowProps = {
  enabled: boolean;
  mode: FlowMode;
  intensity: number;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: FlowMode) => void;
  onIntensityChange: (intensity: number) => void;
};

/**
 * The two integration modes, paired with their button labels.  A
 * module-level constant rather than inline JSX so the markup below reads
 * as a single map over a stable list (matches the cosmic-web style
 * picker's `['smooth', 'filaments', 'both']` idiom).
 */
const MODE_OPTIONS: readonly { mode: FlowMode; label: string }[] = [
  { mode: 'advect', label: 'Advect' },
  { mode: 'streamline', label: 'Streamline' },
];

function FlowRow(props: FlowRowProps): ReactNode {
  const { enabled, mode, intensity, onEnabledChange, onModeChange, onIntensityChange } = props;
  return (
    <div className={styles.row}>
      <div className={styles.topLine}>
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <span>Flow</span>
        </label>
        <span className={styles.hint}>peculiar velocity</span>
      </div>

      {/* Mode switch — a two-button segmented control.  `aria-pressed`
          rather than radio semantics so screen readers announce a toggled
          state per option, parallel to the cosmic-web style picker. */}
      <div className={styles.modeToggle} role="group" aria-label="Flow mode">
        {MODE_OPTIONS.map(({ mode: m, label }) => {
          const pressed = mode === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={pressed}
              disabled={!enabled}
              className={pressed ? styles.modeButtonActive : styles.modeButton}
              onClick={() => onModeChange(m)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Intensity — pre-blend ribbon brightness, [0, 1].  Disabled while
          the layer is off (no visible effect). */}
      <div className={styles.sliderRow}>
        <span className={styles.sliderLabel}>Intensity</span>
        <span className={styles.sliderValue}>{intensity.toFixed(2)}</span>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={intensity}
          disabled={!enabled}
          aria-label="Flow intensity"
          title="Intensity — pre-blend ribbon brightness multiplier."
          onChange={(e) => onIntensityChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export default FlowRow;
