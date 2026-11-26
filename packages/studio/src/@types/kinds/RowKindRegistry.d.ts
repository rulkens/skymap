/** The row-kind registry's shape: one spec per row kind, so a missing kind fails to compile (A5). */
import type { RowKind } from '../rows/RowKind';
import type { RowSubjects } from '../rows/RowSubjects';
import type { RowKindSpec } from './RowKindSpec';

export type RowKindRegistry = { readonly [K in RowKind]: RowKindSpec<RowSubjects[K]> };
