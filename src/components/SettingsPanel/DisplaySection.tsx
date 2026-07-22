// src/components/SettingsPanel/DisplaySection.tsx
/**
 * DisplaySection — presentational component for the Display settings section
 * inside the SettingsPanel.
 *
 * Owns the Display thematic group UI: the orientation and tone-mapping curve
 * dropdowns, plus a nested "Bloom" CollapsibleSection (master enable on its
 * header, strength/threshold sliders in its body — same header-toggle idiom
 * `FlowSection` uses for its master enable). Further subgroups (e.g. the Earth
 * atmosphere-exposure disclosure) are passed in as `children` and rendered
 * below, so Display need not drill their props. Isolating this into its own
 * component ensures a change here re-renders ONLY this section rather than
 * the entire HUD.
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
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import { orientationFrameLabel } from '../../data/orientation/orientationFrameLabel';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../data/defaults';
import { STAR_EMISSIVE } from '../../data/starRenderConstants';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './SettingsPanel.module.css';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * The id SET is the registry's own keys (a new frame can't silently vanish
 * from this dropdown); this only pins display order, default frame first.
 */
const ORIENTATION_FRAME_IDS: readonly OrientationFrameId[] = [
  DEFAULT_ORIENTATION,
  ...(Object.keys(ORIENTATION_FRAMES) as OrientationFrameId[]).filter(
    (id) => id !== DEFAULT_ORIENTATION,
  ),
];

// ── Props ──────────────────────────────────────────────────────────────────────

export type DisplaySectionProps = {
  /** Currently selected orientation frame (which plane is levelled as "up"). */
  orientation: OrientationFrameId;
  /** Called with the newly selected frame when the orientation dropdown changes. */
  onOrientationChange: (frame: OrientationFrameId) => void;
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
  orientation,
  onOrientationChange,
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
        <label htmlFor="orientation-frame">Orientation</label>
        <select
          id="orientation-frame"
          className={styles.modeSelect}
          value={orientation}
          onChange={(e) => onOrientationChange(e.target.value as OrientationFrameId)}
        >
          {ORIENTATION_FRAME_IDS.map((id) => (
            <option key={id} value={id}>
              {orientationFrameLabel(id)}
            </option>
          ))}
        </select>
      </div>

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

      <CollapsibleSection
        title="Bloom"
        headerToggle={bloomEnabled}
        onHeaderToggleChange={onBloomEnabledChange}
      >
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
      </CollapsibleSection>

      {children}
    </CollapsibleSection>
  );
}

export default memo(DisplaySection);
