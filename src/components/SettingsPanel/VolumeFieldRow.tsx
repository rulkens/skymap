/**
 * VolumeFieldRow — one registered scalar-volume field's row of
 * controls in the SettingsPanel's "Volumes" section.
 *
 * Layout (four visual lines):
 *
 *   [✓] CF-4 DM density                            [palette ▾]
 *       Intensity   0.50  [━━━━━━━●━━━━━━━━━━━━━]
 *       Contrast    1.00  [━━━●━━━━━━━━━━━━━━━━━]
 *       Density     5.0   [━━━━━●━━━━━━━━━━━━━━━]
 *
 * Why three separate sliders (intensity / contrast / density):
 *   - intensity is overall opacity (multiplicative).  Cranking it just
 *     makes everything proportionally brighter — fog stays fog.
 *   - contrast drives a windowing transform in the shader: it widens a
 *     deadband around the value midpoint (suppressing near-mean noise)
 *     and stretches the surviving range across the full palette.
 *     "Show structure, hide fog" semantics.
 *   - density is the per-cube alpha multiplier inside the optical-
 *     depth integral.  It's the right knob when windowing has cropped
 *     too aggressively (signal got dim) or when a sparse field needs
 *     lifting into a saturating regime.
 *
 * Bundling any two into one slider collapses an axis users actually
 * need.  The orthogonal trio gives a clean exploration surface.
 *
 * Why a `LabelledSlider` helper rather than three inline `<input>`s:
 *   - DRY: the label + value-readout + slider markup is identical for
 *     the three controls; repeating it three times invites drift.
 *   - Adding a fourth control (e.g. envelope edge) becomes a one-line
 *     change.
 *   - Keeps the row component readable — the layout intent shows
 *     through the three `LabelledSlider` calls instead of being
 *     hidden inside three near-identical 12-line blocks.
 *
 * Why two lines on top instead of one:
 *   - With four controls on one line (checkbox, label, slider,
 *     dropdown) the slider's `flex: 1` would steal all remaining
 *     space and squeeze the dropdown down to (at best) a stub or
 *     (at worst) zero width.  Stacking the sliders underneath gives
 *     them the full row width and the dropdown a stable position.
 *   - Reads top-down ("here's a field, here's its knobs") which
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
 * Contrast slider bounds.  The shader's contrast windowing is well-
 * defined for any positive value; perceptually-useful range is
 * ~[0.25, 4.0].  Below 1.0 the deadband collapses to zero (every
 * voxel contributes); above 4.0 the deadband already covers 75% of
 * the value range, so only the densest peaks and emptiest voids
 * survive — pushing further yields diminishing returns.  Step 0.05
 * for fine control around the identity (1.0) midpoint.
 */
const CONTRAST_MIN = 0.25;
const CONTRAST_MAX = 4.0;
const CONTRAST_STEP = 0.05;

/**
 * Trim slider bounds: the low-end cutoff in normalised LUT-coord
 * space.  Range [0, 0.95] — past 0.95 there's no useful signal left
 * to render.  Step 0.01 for fine control around small trim values
 * where the visual change per tick is largest.
 */
const TRIM_MIN = 0;
const TRIM_MAX = 0.95;
const TRIM_STEP = 0.01;

/**
 * Density (per-cube `densityScale`) slider bounds.  Registry defaults
 * sit in the [4, 20] range (mcpm = 4; debug-cartesian = 4;
 * debug-gaussian = 10; cf4-density = 20), so the slider needs to span
 * well past those for tuning headroom.  0..60 with 0.1 step gives 3x
 * the CF-4 default at the right end and "fully invisible" (0) at the
 * left for quick A/B against a no-volume baseline.  Bumped from 30
 * after MCPM tuning showed the old cap was too restrictive against
 * a heavy-tailed log-normalised cube.
 */
const DENSITY_MIN = 0;
const DENSITY_MAX = 60;
const DENSITY_STEP = 0.1;

export type VolumeFieldRowProps = {
  /** Stable handle (not displayed; passed back to change callbacks). */
  handle: string;
  /** Display label; defaults to the handle when none was provided at registration. */
  label: string;
  enabled: boolean;
  intensity: number;
  contrast: number;
  densityScale: number;
  trim: number;
  paletteId: ScalarFieldPaletteId;
  onEnabledChange: (handle: string, enabled: boolean) => void;
  onIntensityChange: (handle: string, intensity: number) => void;
  onContrastChange: (handle: string, contrast: number) => void;
  onTrimChange?: (handle: string, trim: number) => void;
  /**
   * Optional — when omitted, the Density slider still renders but its
   * onChange becomes a no-op.  Letting the slider render even without
   * a handler keeps the visual layout stable across SettingsPanel
   * configurations; future callers that DO want the knob just pass
   * the handler.
   */
  onDensityScaleChange?: (handle: string, value: number) => void;
  /** Optional — when omitted, the palette dropdown is hidden. */
  onPaletteChange?: (handle: string, id: ScalarFieldPaletteId) => void;
};

/**
 * Internal helper: a slider with a left-aligned label and a current-
 * value readout.  The three columns (label / value / slider) line up
 * across rows thanks to fixed-width label + value via CSS.
 *
 * `formatValue` lets each caller pick its own precision (intensity to
 * two decimals, density to one) without leaking number-formatting
 * concerns into this component.
 */
type LabelledSliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  formatValue: (value: number) => string;
  ariaLabel: string;
  title: string;
  onChange: (value: number) => void;
};

function LabelledSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  formatValue,
  ariaLabel,
  title,
  onChange,
}: LabelledSliderProps): ReactNode {
  return (
    <div className={styles.sliderRow}>
      <span className={styles.sliderLabel}>{label}</span>
      <span className={styles.sliderValue}>{formatValue(value)}</span>
      <input
        className={styles.slider}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function VolumeFieldRow({
  handle,
  label,
  enabled,
  intensity,
  contrast,
  densityScale,
  trim,
  paletteId,
  onEnabledChange,
  onIntensityChange,
  onContrastChange,
  onTrimChange,
  onDensityScaleChange,
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
      <LabelledSlider
        label="Intensity"
        value={intensity}
        min={0}
        max={1}
        step={0.01}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(2)}
        ariaLabel={`${label} intensity`}
        title="Intensity — overall opacity multiplier."
        onChange={(v) => onIntensityChange(handle, v)}
      />
      <LabelledSlider
        label="Contrast"
        value={contrast}
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        step={CONTRAST_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(2)}
        ariaLabel={`${label} contrast`}
        title="Contrast — widens a deadband around the midpoint and stretches the surviving range across the palette."
        onChange={(v) => onContrastChange(handle, v)}
      />
      <LabelledSlider
        label="Trim"
        value={trim}
        min={TRIM_MIN}
        max={TRIM_MAX}
        step={TRIM_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(2)}
        ariaLabel={`${label} trim`}
        title="Trim — low-end cutoff that hard-suppresses voxels below the threshold (Polyphorm-style trim_density in normalised LUT space)."
        onChange={(v) => onTrimChange?.(handle, v)}
      />
      <LabelledSlider
        label="Density"
        value={densityScale}
        min={DENSITY_MIN}
        max={DENSITY_MAX}
        step={DENSITY_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(1)}
        ariaLabel={`${label} density`}
        title="Density — per-cube alpha multiplier inside the optical-depth integral."
        onChange={(v) => onDensityScaleChange?.(handle, v)}
      />
    </div>
  );
}
