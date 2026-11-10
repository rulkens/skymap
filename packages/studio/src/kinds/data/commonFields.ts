/**
 * The fields most kinds share, built once. `param` is cast: TypeScript cannot see that a generic `T`
 * extending `{ over: number }` has `'over'` among its string keys, but every call site is checked
 * against its own subject type when the field lands in that kind's `fields`.
 */
import type { Ease } from '../../../../../src/@types/animation/Ease';
import type { FieldSpec } from '../../@types/kinds/FieldSpec';

export const overField = <T extends { readonly over?: number }>(
  label = 'Duration',
  fallback?: number,
): FieldSpec<T> => ({
  key: 'over',
  param: 'over' as FieldSpec<T>['param'],
  label,
  control: 'seconds',
  ...(fallback === undefined ? {} : { fallback }),
});

export const easeField = <T extends { readonly ease?: Ease }>(): FieldSpec<T> => ({
  key: 'ease',
  param: 'ease' as FieldSpec<T>['param'],
  label: 'Ease',
  control: 'ease',
});

export const readoutField = <T>(param: FieldSpec<T>['param'], label: string): FieldSpec<T> => ({
  key: param,
  param,
  label,
  control: 'readout',
  readOnly: true,
});
