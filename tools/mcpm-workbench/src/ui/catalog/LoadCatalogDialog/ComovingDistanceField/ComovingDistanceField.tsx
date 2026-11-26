/** ComovingDistanceField — the cosmology a redshift becomes a distance under: H0 and Ωm, side by side. */
import type { ReactNode } from 'react';
import type { CatalogImportFields } from '../../../../../@types/catalog/import/CatalogImportFields';
import FormField from '../../../panel/FormField/FormField';
import controls from '../dialogControl.module.css';
import styles from './ComovingDistanceField.module.css';

export type ComovingDistanceFieldProps = {
  readonly h0: string;
  readonly omegaM: string;
  readonly h0Error: string | undefined;
  readonly omegaMError: string | undefined;
  readonly inactive: boolean;
  readonly onEdit: (patch: Partial<CatalogImportFields>) => void;
  /** The blur handler that reveals `field`'s error. */
  readonly onCheck: (field: 'h0' | 'omegaM') => () => void;
};

function ComovingDistanceField({
  h0,
  omegaM,
  h0Error,
  omegaMError,
  inactive,
  onEdit,
  onCheck,
}: ComovingDistanceFieldProps): ReactNode {
  return (
    <FormField
      label="Comoving distance"
      hint="From redshift, flat ΛCDM."
      error={h0Error ?? omegaMError}
      validated
      inactive={inactive}
    >
      {(ids) => (
        <div id={ids.control} role="group" aria-labelledby={ids.label} className={styles.root}>
          <label className={styles.field}>
            H0 (km/s/Mpc)
            <input
              name="h0"
              className={controls.number}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={h0Error !== undefined}
              aria-describedby={ids.hint}
              value={h0}
              onChange={(e) => onEdit({ h0: e.target.value })}
              onBlur={onCheck('h0')}
            />
          </label>
          <label className={styles.field}>
            Ωm
            <input
              name="omegaM"
              className={controls.number}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={omegaMError !== undefined}
              aria-describedby={ids.hint}
              value={omegaM}
              onChange={(e) => onEdit({ omegaM: e.target.value })}
              onBlur={onCheck('omegaM')}
            />
          </label>
        </div>
      )}
    </FormField>
  );
}

export default ComovingDistanceField;
