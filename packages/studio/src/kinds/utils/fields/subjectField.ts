/** The Subject field every object-bound kind shares: the object picker over its focus id. `param` is cast as in `overField`. */
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function subjectField<T extends { readonly id: unknown }>(): FieldSpec<T> {
  return { key: 'id', param: 'id' as FieldSpec<T>['param'], label: 'Subject', control: 'subject' };
}
