/**
 * PaletteSelect — a small `<select>` wrapper for picking one of the
 * scalar-field palette ids defined in `data/scalarFieldPalettes.ts`.
 *
 * Lives in `components/common/` because more than one surface needs to
 * pick a palette: today the per-field row in the SettingsPanel's
 * Volumes section, tomorrow potentially a future LoadingDevPanel
 * preview or a CF-4 cosmography control.  Centralising the option
 * source (`PALETTE_IDS`), the value/onChange contract, and the
 * styling (so the select doesn't get squeezed inside flex rows — see
 * `.paletteSelect`'s `flex-shrink: 0`) means each call site is a
 * one-liner.
 *
 * Why a dedicated component rather than reusing a generic `<Select>`:
 * we don't have a generic Select primitive yet, and the option set is
 * fixed (palette ids) so there's no list-prop overhead to design for.
 * If a generic Select lands later, this component becomes a thin
 * specialisation of it.
 */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../@types/data/ScalarFieldPaletteId';
import { PALETTE_IDS } from '../../../data/scalarFieldPalettes';
import styles from './PaletteSelect.module.css';

export type PaletteSelectProps = {
  /** Currently selected palette id; controlled. */
  value: ScalarFieldPaletteId;
  /** Fired with the user's new selection. */
  onChange: (id: ScalarFieldPaletteId) => void;
  /** Mirrors the native `<select disabled>`; defaults to `false`. */
  disabled?: boolean;
  /** Optional extra class to merge with the default styling. */
  className?: string;
};

export function PaletteSelect({
  value,
  onChange,
  disabled,
  className,
}: PaletteSelectProps): ReactNode {
  return (
    <select
      className={className ? `${styles.paletteSelect} ${className}` : styles.paletteSelect}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ScalarFieldPaletteId)}
    >
      {PALETTE_IDS.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}
