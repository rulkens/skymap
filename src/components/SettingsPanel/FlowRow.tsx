/**
 * FlowRow — the explorer-facing controls for the CF4++ peculiar-velocity
 * flow-field overlay, living in the body of the SettingsPanel's "Flow"
 * section.
 *
 * Layout (two stacked regions, mirroring the Cosmic web body):
 *
 *   [ Advect ][ Streamline ]
 *   Intensity   0.70  [━━━━━━━━━━━●━━━━━━]
 *
 * The enable toggle is NOT here — it lives on the section header as the
 * `CollapsibleSection`'s `headerToggle`, exactly like the Galaxies / Cosmic
 * web / Structures / Labels masters, so every section's on/off sits on the
 * same line. This row renders only the look controls and greys them out when
 * the layer is off (`enabled === false`).
 *
 * What each control does:
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
 * explorer surface stays to the two controls that change the look at a
 * glance.
 */
import type { ReactNode } from 'react';
import type { FlowMode } from '../../@types/data/FlowMode';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import { FLOW_SLIDER_FIELDS, flowSliderPatch } from '../../data/flowFields';
import styles from './FlowRow.module.css';

export type FlowRowProps = {
  flow: FlowSettings;
  onChange: (patch: Partial<FlowSettings>) => void;
};

/** The slider knobs that surface in the explorer panel (just intensity today). */
const PANEL_SLIDERS = FLOW_SLIDER_FIELDS.filter((f) => f.surface === 'panel');

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

function FlowRow({ flow, onChange }: FlowRowProps): ReactNode {
  const { enabled, mode } = flow;
  return (
    <div className={styles.row}>
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
              onClick={() => onChange({ mode: m })}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Panel-surface sliders (intensity today) — driven from the flow field
          registry so ranges/labels live in one place.  Disabled while the layer
          is off (no visible effect). */}
      {PANEL_SLIDERS.map((f) => (
        <div className={styles.sliderRow} key={f.key}>
          <span className={styles.sliderLabel}>{f.label}</span>
          <span className={styles.sliderValue}>{f.format(flow[f.key])}</span>
          <input
            className={styles.slider}
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={flow[f.key]}
            disabled={!enabled}
            aria-label={`Flow ${f.label.toLowerCase()}`}
            title={f.title}
            onChange={(e) => onChange(flowSliderPatch(f.key, Number(e.target.value)))}
          />
        </div>
      ))}
    </div>
  );
}

export default FlowRow;
