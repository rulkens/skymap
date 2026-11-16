/**
 * DebugColorRow — one labelled colour-picker row for a DebugPanel tuning section.
 *
 * `value` is LINEAR RGB (what the shaders consume) but the native picker speaks
 * sRGB hex, so the row converts both ways; callers never see a hex string.
 * Reuses the slider row's classes so colour and range rows line up.
 */

import type { ReactNode } from 'react';
import type { HexString } from '../../@types/math/HexString';
import type { Vec3 } from '../../@types/math/Vec3';
import { hexToLinearRgb } from '../../utils/color/hexToLinearRgb';
import { linearRgbToHex } from '../../utils/color/linearRgbToHex';
import styles from './DebugSlider.module.css';

export type DebugColorRowProps = {
  readonly label: string;
  readonly value: Vec3;
  readonly title?: string;
  readonly onChange: (color: Vec3) => void;
};

function DebugColorRow({ label, value, title, onChange }: DebugColorRowProps): ReactNode {
  const hex = linearRgbToHex(value);
  return (
    <label className={styles.root} title={title}>
      <span className={styles.label}>{label}</span>
      <span className={styles.readout}>{hex}</span>
      <input
        type="color"
        aria-label={label}
        value={hex}
        onChange={(e) => onChange(hexToLinearRgb(e.target.value as HexString))}
      />
    </label>
  );
}

export default DebugColorRow;
