/**
 * The `over` field most kinds share. `param` is cast: TypeScript cannot see that a generic `T`
 * extending `{ over: number }` has `'over'` among its string keys, but every call site is checked
 * against its own subject type when the field lands in that kind's `fields`.
 */
import type { FieldSpec } from '../../../@types/kinds/FieldSpec';

export function overField<T extends { readonly over?: number }>(
  label = 'Duration',
  absent: Pick<FieldSpec<T>, 'fallback' | 'optional'> = {},
): FieldSpec<T> {
  return {
    key: 'over',
    param: 'over' as FieldSpec<T>['param'],
    label,
    control: 'seconds',
    ...absent,
  };
}
