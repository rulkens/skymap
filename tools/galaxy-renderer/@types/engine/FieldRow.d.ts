import type { FieldTarget } from '../../../../src/layers/milkyWay/field/@types/FieldTarget';

/** The texture (probe readbacks copy from it) and the one view the field module binds. */
export type FieldRow = { readonly texture: GPUTexture; readonly target: FieldTarget };
