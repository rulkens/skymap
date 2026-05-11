/**
 * VolumeFieldRow — one registered scalar-volume field's row of
 * controls in the SettingsPanel's "Volumes" section.
 *
 * Layout (three visual lines):
 *
 *   [✓] gaussian                                  [palette ▾]
 *       [━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━] (intensity)
 *       [━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━] (contrast)
 *
 * Why a separate contrast slider rather than folding it into intensity:
 * intensity is a multiplicative opacity knob (everything gets brighter
 * proportionally) — it does not actually increase contrast.  Contrast
 * is a gamma-style LUT-coordinate remap around the 0.5 pivot, which
 * pushes mid-tones toward the saturated palette ends.  The two are
 * orthogonal: brightness × dynamic-range stretch.  Bundling them into
 * one slider would collapse the brightness axis users actually need to
 * tune opacity for "fog vs solid".
 *
 * Why two lines on top instead of one:
 *   - With four controls on one line (checkbox, label, slider,
 *     dropdown) the slider's `flex: 1` would steal all remaining
 *     space and squeeze the dropdown down to (at best) a stub or
 *     (at worst) zero width.  Stacking the slider underneath gives
 *     it the full row width and the dropdown a stable position.
 *   - Reads top-down ("here's a field, here's its strength") which
 *     matches the user's mental model better than three-or-four
 *     equal-weight controls in a horizontal soup.
 *
 * The palette dropdown is conditional — when the parent doesn't wire
 * `onPaletteChange`, the slot disappears and the top line collapses
 * to just the enable checkbox + label.
 */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../@types/ScalarCube';
import { PaletteSelect } from '../common/PaletteSelect/PaletteSelect';
import styles from './VolumeFieldRow.module.css';

/**
 * Contrast slider bounds.  The shader's contrast remap is well-defined
 * for any positive value; perceptually-useful range is ~[0.25, 4.0].
 * Below 0.25 the volume is so flattened that it reads as fog; above
 * 4.0 the gamma curve has already pushed everything to the saturated
 * ends and pushing further makes no visible difference.  Step is 0.05
 * for fine control around the identity (1.0) midpoint.
 */
const CONTRAST_MIN = 0.25;
const CONTRAST_MAX = 4.0;
const CONTRAST_STEP = 0.05;

export type VolumeFieldRowProps = {
  /** Stable handle (not displayed; passed back to change callbacks). */
  handle: string;
  /** Display label; defaults to the handle when none was provided at registration. */
  label: string;
  enabled: boolean;
  intensity: number;
  contrast: number;
  paletteId: ScalarFieldPaletteId;
  onEnabledChange: (handle: string, enabled: boolean) => void;
  onIntensityChange: (handle: string, intensity: number) => void;
  onContrastChange: (handle: string, contrast: number) => void;
  /** Optional — when omitted, the palette dropdown is hidden. */
  onPaletteChange?: (handle: string, id: ScalarFieldPaletteId) => void;
};

export function VolumeFieldRow({
  handle,
  label,
  enabled,
  intensity,
  contrast,
  paletteId,
  onEnabledChange,
  onIntensityChange,
  onContrastChange,
  onPaletteChange,
}: VolumeFieldRowProps): ReactNode {
  return (
    <div className={styles.row}>
      <div className={styles.topLine}>
        <label className={styles.label}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(handle, e.target.checked)}
          />
          <span>{label}</span>
        </label>
        {onPaletteChange && (
          <div className={styles.paletteSlot}>
            <PaletteSelect
              value={paletteId}
              disabled={!enabled}
              onChange={(id) => onPaletteChange(handle, id)}
            />
          </div>
        )}
      </div>
      <input
        className={styles.intensitySlider}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={intensity}
        disabled={!enabled}
        aria-label={`${label} intensity`}
        title="Intensity (overall opacity)"
        onChange={(e) => onIntensityChange(handle, Number(e.target.value))}
      />
      <input
        className={styles.intensitySlider}
        type="range"
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        step={CONTRAST_STEP}
        value={contrast}
        disabled={!enabled}
        aria-label={`${label} contrast`}
        title="Contrast (push mid-tones toward palette extremes)"
        onChange={(e) => onContrastChange(handle, Number(e.target.value))}
      />
    </div>
  );
}
