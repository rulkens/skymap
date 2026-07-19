// src/components/SettingsPanel/DisplaySection.tsx
/**
 * DisplaySection — presentational component for the Display settings section
 * inside the SettingsPanel.
 *
 * Owns the Display thematic group UI: the tone-mapping curve dropdown plus an
 * "Earth" subgroup with the atmosphere-shell exposure slider. Isolating this
 * into its own component ensures a change here re-renders ONLY this section
 * rather than the entire HUD.
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
import type { ToneMapCurve as ToneMapCurveT } from '../../@types/data/ToneMapCurve';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './SettingsPanel.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

export type DisplaySectionProps = {
  /** Currently selected tone-mapping curve. */
  toneMapCurve: ToneMapCurveT;
  /** Called with the newly selected curve when the dropdown changes. */
  onToneMapCurveChange: (curve: ToneMapCurveT) => void;
  /** Exposure scale on Earth's in-scatter atmosphere shell. */
  atmosphereExposure: number;
  /** Called with the new exposure as the slider drags. */
  onAtmosphereExposureChange: (value: number) => void;
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
  atmosphereExposure,
  onAtmosphereExposureChange,
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

      <h3 className={styles.panelSubtitle}>Earth</h3>
      <div className={styles.panelRow}>
        <label htmlFor="atmosphere-exposure">Atmosphere exposure</label>
        <span className={styles.panelValue}>{atmosphereExposure.toFixed(2)}</span>
      </div>
      <div className={styles.panelRow}>
        <input
          id="atmosphere-exposure"
          type="range"
          min="0"
          max="4"
          step="0.05"
          value={atmosphereExposure}
          onChange={(e) => onAtmosphereExposureChange(Number(e.target.value))}
        />
      </div>
    </CollapsibleSection>
  );
}

export default memo(DisplaySection);
