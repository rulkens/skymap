/**
 * TonemapSelect — the HDR-to-LDR tone-mapping curve picker, as a plain
 * `<select>`.
 *
 * The option list is DERIVED from the runtime's `ALL_TONE_MAP_CURVES` +
 * `toneMapCurveLabel`, not hand-authored here. The tool used to carry its own
 * five-entry table with different curves under the same names and different
 * numeric indices for the same curve — so "Reinhard extended" in the tool and
 * "Reinhard (natural)" in the app were neither the same math nor the same
 * uniform value, and a curve chosen here meant something else there. Deriving
 * the list makes that class of drift impossible: the numbers ARE the shader
 * contract (`compositor/fragment.wesl`'s `u.curve` dispatch), and there is now
 * exactly one table of them.
 */
import type { ReactNode } from 'react';
import type { ToneMapCurve } from '../../../../../src/@types/data/ToneMapCurve';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../../../../src/data/toneMapCurve';
import styles from './TonemapSelect.module.css';

export type TonemapSelectProps = {
  readonly value: ToneMapCurve;
  readonly onChange: (mode: ToneMapCurve) => void;
};

function TonemapSelect({ value, onChange }: TonemapSelectProps): ReactNode {
  return (
    <select
      className={styles.root}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as ToneMapCurve)}
    >
      {ALL_TONE_MAP_CURVES.map((curve) => (
        <option key={curve} value={curve}>
          {toneMapCurveLabel(curve)}
        </option>
      ))}
    </select>
  );
}

export default TonemapSelect;
