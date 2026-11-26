/** ChoiceField — a load dialog row of segmented choices, its help line the chosen one's hint. */
import type { ReactNode } from 'react';
import type { CatalogImportChoice } from '../../../../../@types/catalog/import/CatalogImportChoice';
import FormField from '../../../panel/FormField/FormField';
import SegmentedControl from '../../../panel/SegmentedControl/SegmentedControl';

export type ChoiceFieldProps<V extends string> = {
  readonly label: string;
  readonly choices: readonly CatalogImportChoice<V>[];
  readonly value: V;
  readonly inactive: boolean;
  readonly onChange: (value: V) => void;
};

function ChoiceField<V extends string>({
  label,
  choices,
  value,
  inactive,
  onChange,
}: ChoiceFieldProps<V>): ReactNode {
  return (
    <FormField
      label={label}
      hint={choices.find((c) => c.value === value)!.hint}
      hints={choices.map((c) => c.hint)}
      inactive={inactive}
    >
      {(ids) => (
        <SegmentedControl
          options={choices}
          value={value}
          onChange={onChange}
          labelledBy={ids.label}
          describedBy={ids.hint}
        />
      )}
    </FormField>
  );
}

export default ChoiceField;
