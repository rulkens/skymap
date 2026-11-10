/** A field the structure sets and slice 1 only shows. */
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function readoutField<T>(param: FieldSpec<T>['param'], label: string): FieldSpec<T> {
  return { key: param, param, label, control: 'readout', readOnly: true };
}
