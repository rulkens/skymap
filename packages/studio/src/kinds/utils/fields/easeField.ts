/** The Ease field most kinds share. `param` is cast as in `overField`. */
import type { Ease } from '../../../../../../src/@types/animation/Ease';
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function easeField<T extends { readonly ease?: Ease }>(): FieldSpec<T> {
  return { key: 'ease', param: 'ease' as FieldSpec<T>['param'], label: 'Ease', control: 'ease' };
}
