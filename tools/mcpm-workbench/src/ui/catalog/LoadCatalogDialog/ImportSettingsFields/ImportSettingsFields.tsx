/**
 * ImportSettingsFields — the load dialog's import settings: the columns, the comoving
 * distance a redshift needs, what the weight is and its scale. Rows of the dialog's
 * form grid, so it renders them bare. A packed pair carries its own settings, so
 * then every row is inactive.
 */
import type { ReactNode } from 'react';
import type { WeightUnitWarning } from '../../../../../@types/catalog/weights/WeightUnitWarning';
import ChoiceField from '../ChoiceField/ChoiceField';
import ComovingDistanceField from '../ComovingDistanceField/ComovingDistanceField';
import WeightScaleField from '../WeightScaleField/WeightScaleField';
import { FORMAT_CHOICES } from '../data/formatChoices.constant';
import { WEIGHT_CHOICES } from '../data/weightChoices.constant';
import type { useImportFields } from '../useImportFields';

export type ImportSettingsFieldsProps = {
  readonly form: ReturnType<typeof useImportFields>;
  readonly packed: boolean;
  readonly warning: WeightUnitWarning | null;
  /** The warning was found under settings that have since changed. */
  readonly stale: boolean;
};

function ImportSettingsFields({
  form,
  packed,
  warning,
  stale,
}: ImportSettingsFieldsProps): ReactNode {
  const { fields, edit, shown, check } = form;
  return (
    <>
      <ChoiceField
        label="Columns"
        choices={FORMAT_CHOICES}
        value={fields.formatKind}
        inactive={packed}
        onChange={(formatKind) => edit({ formatKind })}
      />
      <ComovingDistanceField
        h0={fields.h0}
        omegaM={fields.omegaM}
        h0Error={shown('h0')}
        omegaMError={shown('omegaM')}
        inactive={packed || fields.formatKind !== 'raDecRedshift'}
        onEdit={edit}
        onCheck={check}
      />
      <ChoiceField
        label="Weight is"
        choices={WEIGHT_CHOICES}
        value={fields.weightKind}
        inactive={packed}
        onChange={(weightKind) => edit({ weightKind })}
      />
      <WeightScaleField
        scale={fields.scale}
        error={shown('scale')}
        warning={warning}
        stale={stale}
        inactive={packed || fields.weightKind !== 'linear'}
        onEdit={edit}
        onCheck={check('scale')}
      />
    </>
  );
}

export default ImportSettingsFields;
