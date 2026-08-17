/**
 * VolumeFieldRow — one registered scalar-volume field's row of
 * controls in the SettingsPanel's "Volumes" section.
 *
 * Layout (four visual lines):
 *
 *   [✓] CF-4 DM density                            [palette ▾]
 *       [Intensity ━━━━━━━●━━━━━━━━━━━━━ 0.50]
 *       [Contrast  ━━━●━━━━━━━━━━━━━━━━━ 1.00]
 *       [Density   ━━━━━●━━━━━━━━━━━━━━━  5.0]
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
 * Why a `LabelledSlider` helper rather than five inline `<Slider>`s:
 *   - DRY: the row wrapper + descriptive hover `title` is identical for
 *     every control; repeating it five times invites drift.
 *   - Adding another control becomes a one-line change.
 *   - Keeps the row component readable — the layout intent shows
 *     through the `LabelledSlider` calls instead of being hidden
 *     inside near-identical blocks. Each `<Slider>` itself folds its
 *     own label + value readout into one pill (see
 *     `common/Slider/Slider.tsx`).
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
import type { ScalarFieldPaletteId } from '../../@types/data/volume/ScalarFieldPaletteId';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import { PaletteSelect } from '../common/PaletteSelect/PaletteSelect';
import Slider from '../common/Slider/Slider';
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
 * Exposure slider bounds: HDR brightness multiplier on the rgb
 * contribution per ray-march step.  Range [1, 32] — 1 is no boost
 * (identity), 4-8 is moderate HDR (peaks brighten, mid-tones
 * unchanged), 16-32 produces aggressive white blow-out at peaks.
 * Step 0.5 because the perceptual difference per integer is large.
 */
const EXPOSURE_MIN = 1;
const EXPOSURE_MAX = 32;
const EXPOSURE_STEP = 0.5;

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
  /** Stable id (not displayed; passed back to change callbacks). */
  id: VolumeFieldId;
  /** Display label; defaults to the id when none was provided at registration. */
  label: string;
  enabled: boolean;
  intensity: number;
  contrast: number;
  densityScale: number;
  trim: number;
  exposure: number;
  paletteId: ScalarFieldPaletteId;
  onEnabledChange: (id: VolumeFieldId, enabled: boolean) => void;
  onIntensityChange: (id: VolumeFieldId, intensity: number) => void;
  onContrastChange: (id: VolumeFieldId, contrast: number) => void;
  onTrimChange?: (id: VolumeFieldId, trim: number) => void;
  onExposureChange?: (id: VolumeFieldId, exposure: number) => void;
  /**
   * Optional — when omitted, the Density slider still renders but its
   * onChange becomes a no-op.  Letting the slider render even without
   * a handler keeps the visual layout stable across SettingsPanel
   * configurations; future callers that DO want the knob just pass
   * the handler.
   */
  onDensityScaleChange?: (id: VolumeFieldId, value: number) => void;
  /** Optional — when omitted, the palette dropdown is hidden. */
  onPaletteChange?: (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void;
};

/**
 * Internal helper: one labelled row wrapping the shared compact `Slider`
 * (label + value folded into the pill — see `common/Slider/Slider.tsx`).
 * `title` keeps the descriptive hover tooltip on the row even though
 * `Slider` itself has no `title` prop.
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
  title,
  onChange,
}: LabelledSliderProps): ReactNode {
  return (
    <div className={styles.sliderRow} title={title}>
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={onChange}
        format={formatValue}
      />
    </div>
  );
}

export function VolumeFieldRow({
  id,
  label,
  enabled,
  intensity,
  contrast,
  densityScale,
  trim,
  exposure,
  paletteId,
  onEnabledChange,
  onIntensityChange,
  onContrastChange,
  onTrimChange,
  onExposureChange,
  onDensityScaleChange,
  onPaletteChange,
}: VolumeFieldRowProps): ReactNode {
  return (
    <div className={styles.row}>
      <div className={styles.topLine}>
        <label className={styles.label}>
          <input
            type="checkbox"
            className={styles.toggle}
            checked={enabled}
            onChange={(e) => onEnabledChange(id, e.target.checked)}
          />
          <span>{label}</span>
        </label>
        {onPaletteChange && (
          <div className={styles.paletteSlot}>
            <PaletteSelect
              value={paletteId}
              disabled={!enabled}
              onChange={(paletteId) => onPaletteChange(id, paletteId)}
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
        title="Intensity — overall opacity multiplier."
        onChange={(v) => onIntensityChange(id, v)}
      />
      <LabelledSlider
        label="Contrast"
        value={contrast}
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        step={CONTRAST_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(2)}
        title="Contrast — widens a deadband around the midpoint and stretches the surviving range across the palette."
        onChange={(v) => onContrastChange(id, v)}
      />
      <LabelledSlider
        label="Trim"
        value={trim}
        min={TRIM_MIN}
        max={TRIM_MAX}
        step={TRIM_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(2)}
        title="Trim — low-end cutoff that hard-suppresses voxels below the threshold (Polyphorm-style trim_density in normalised LUT space)."
        onChange={(v) => onTrimChange?.(id, v)}
      />
      <LabelledSlider
        label="Exposure"
        value={exposure}
        min={EXPOSURE_MIN}
        max={EXPOSURE_MAX}
        step={EXPOSURE_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(1)}
        title="Exposure — HDR multiplier on the rgb contribution per ray-march step; weighted to brighten only peaks so mid-tones stay LDR-bounded."
        onChange={(v) => onExposureChange?.(id, v)}
      />
      <LabelledSlider
        label="Density"
        value={densityScale}
        min={DENSITY_MIN}
        max={DENSITY_MAX}
        step={DENSITY_STEP}
        disabled={!enabled}
        formatValue={(v) => v.toFixed(1)}
        title="Density — per-cube alpha multiplier inside the optical-depth integral."
        onChange={(v) => onDensityScaleChange?.(id, v)}
      />
    </div>
  );
}
