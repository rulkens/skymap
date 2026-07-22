// src/components/SettingsPanel/DisplaySection.tsx
/**
 * DisplaySection — presentational component for the Display settings section
 * inside the SettingsPanel.
 *
 * Owns the Display thematic group UI: the tone-mapping curve dropdown and the
 * Bloom sub-group (enabled toggle + strength/threshold sliders). Nested
 * subgroups (e.g. the Earth atmosphere-exposure disclosure) are passed in as
 * `children` and rendered below, so Display need not drill their props.
 * Isolating this into its own component ensures a change here re-renders ONLY
 * this section rather than the entire HUD.
 *
 * ### Props-driven, no internal state
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and the transient CollapsibleSection open/closed state. Tests supply plain
 * props with no Provider.
 *
 * Why `memo`: when `DisplaySectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step so the section does
 * not re-render. The `useCallback`-wrapped handler the container passes in has
 * stable identity (dispatch is invariant), making the bail effective.
 *
 * The `parseInt(value, 10) as ToneMapCurveT` parse in the `onChange` handler
 * is necessary because `<select>` value attributes are always strings — the
 * numeric curve codes stored in the const object and required by the GPU
 * contract must be explicitly reconstructed from the string the browser returns.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import type { ToneMapCurve as ToneMapCurveT } from '../../@types/data/ToneMapCurve';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import { STAR_EMISSIVE } from '../../data/starRenderConstants';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

export type DisplaySectionProps = {
  /** Currently selected tone-mapping curve. */
  toneMapCurve: ToneMapCurveT;
  /** Called with the newly selected curve when the dropdown changes. */
  onToneMapCurveChange: (curve: ToneMapCurveT) => void;
  /** Whether the screen-space bloom pass is active. */
  bloomEnabled: boolean;
  /** Called with the toggled flag when the bloom checkbox is clicked. */
  onBloomEnabledChange: (next: boolean) => void;
  /** Scale on the blurred mip pyramid composited back over the HDR frame. */
  bloomStrength: number;
  /** Called with the new strength as the slider drags. */
  onBloomStrengthChange: (next: number) => void;
  /** HDR luminance above which a pixel contributes to the bloom pyramid. */
  bloomThreshold: number;
  /** Called with the new threshold as the slider drags. */
  onBloomThresholdChange: (next: number) => void;
  /** Nested subgroups rendered below the tone-curve dropdown (e.g. Earth). */
  children?: ReactNode;
};

// ── DisplaySection ─────────────────────────────────────────────────────────────

/**
 * Renders the Display thematic group: a single tone-curve dropdown in a
 * power-user disclosure (default closed — explorer never sees tone-curve
 * jargon; tweaker opens one disclosure to find it).
 */
function DisplaySection({
  toneMapCurve,
  onToneMapCurveChange,
  bloomEnabled,
  onBloomEnabledChange,
  bloomStrength,
  onBloomStrengthChange,
  bloomThreshold,
  onBloomThresholdChange,
  children,
}: DisplaySectionProps) {
  return (
    <CollapsibleSection title="Display">
      <div className={styles.panelRow}>
        <label htmlFor="tonemap-curve">Tone curve</label>
        <select
          id="tonemap-curve"
          className={styles.modeSelect}
          value={toneMapCurve}
          onChange={(e) => onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurveT)}
        >
          {ALL_TONE_MAP_CURVES.map((c) => (
            <option key={c} value={c}>
              {toneMapCurveLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.panelRow}>
        <label htmlFor="bloom-enabled">Bloom</label>
        <input
          id="bloom-enabled"
          type="checkbox"
          className={styles.toggle}
          checked={bloomEnabled}
          onChange={(e) => onBloomEnabledChange(e.target.checked)}
        />
      </div>
      <div className={styles.panelRow}>
        <label htmlFor="bloom-strength">Strength</label>
        <span className={styles.panelValue}>{bloomStrength.toFixed(2)}</span>
      </div>
      <div className={styles.panelRow}>
        <input
          id="bloom-strength"
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={bloomStrength}
          onChange={(e) => onBloomStrengthChange(Number(e.target.value))}
        />
      </div>
      <div className={styles.panelRow}>
        <label htmlFor="bloom-threshold">Threshold</label>
        <span className={styles.panelValue}>{bloomThreshold.toFixed(1)}</span>
      </div>
      <div className={styles.panelRow}>
        {/* Ceiling is the resolved-star emissive: above it the threshold would
            exclude the Sun's own disc and kill its bloom. See the ordering
            invariant in data/starRenderConstants.ts. */}
        <input
          id="bloom-threshold"
          type="range"
          min="0"
          max={STAR_EMISSIVE}
          step="0.1"
          value={bloomThreshold}
          onChange={(e) => onBloomThresholdChange(Number(e.target.value))}
        />
      </div>

      {children}
    </CollapsibleSection>
  );
}

export default memo(DisplaySection);
