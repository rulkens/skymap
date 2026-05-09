/**
 * VolumeFieldRow — one registered scalar-volume field's row of
 * controls in the SettingsPanel's "Volumes" section.
 *
 * Layout (two visual lines):
 *
 *   [✓] gaussian                                  [palette ▾]
 *       [━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━] (intensity)
 *
 * Why two lines instead of one:
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

export type VolumeFieldRowProps = {
  /** Stable handle (not displayed; passed back to change callbacks). */
  handle: string;
  /** Display label; defaults to the handle when none was provided at registration. */
  label: string;
  enabled: boolean;
  intensity: number;
  paletteId: ScalarFieldPaletteId;
  onEnabledChange: (handle: string, enabled: boolean) => void;
  onIntensityChange: (handle: string, intensity: number) => void;
  /** Optional — when omitted, the palette dropdown is hidden. */
  onPaletteChange?: (handle: string, id: ScalarFieldPaletteId) => void;
};

export function VolumeFieldRow({
  handle,
  label,
  enabled,
  intensity,
  paletteId,
  onEnabledChange,
  onIntensityChange,
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
        onChange={(e) => onIntensityChange(handle, Number(e.target.value))}
      />
    </div>
  );
}
