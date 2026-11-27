/** WeightScaleField — the factor a linear weight is multiplied by, and the unit warning the parse may raise. */
import type { ReactNode } from 'react';
import type { CatalogImportFields } from '../../../../../@types/catalog/import/CatalogImportFields';
import type { WeightUnitWarning } from '../../../../../@types/catalog/weights/WeightUnitWarning';
import FormField from '../../../panel/FormField/FormField';
import controls from '../dialogControl.module.css';

export type WeightScaleFieldProps = {
  readonly scale: string;
  readonly error: string | undefined;
  readonly warning: WeightUnitWarning | null;
  /** The warning was found under settings that have since changed. */
  readonly stale: boolean;
  readonly inactive: boolean;
  readonly onEdit: (patch: Partial<CatalogImportFields>) => void;
  readonly onCheck: () => void;
};

function WeightScaleField({
  scale,
  error,
  warning,
  stale,
  inactive,
  onEdit,
  onCheck,
}: WeightScaleFieldProps): ReactNode {
  return (
    <FormField
      label="Weight scale"
      hint={'0.001 turns 10⁹\u00a0M☉ into 10¹²\u00a0M☉.'}
      error={error}
      warning={warning ? { message: warning.message, stale } : undefined}
      validated
      inactive={inactive}
    >
      {(ids) => (
        <input
          id={ids.control}
          name="scale"
          className={controls.number}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={error !== undefined}
          aria-describedby={ids.hint}
          data-warned={warning?.field === 'scale'}
          value={scale}
          onChange={(e) => onEdit({ scale: e.target.value })}
          onBlur={onCheck}
        />
      )}
    </FormField>
  );
}

export default WeightScaleField;
