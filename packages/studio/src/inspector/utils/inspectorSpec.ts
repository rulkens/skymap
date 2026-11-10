/** A kind's registry entry typed over a string-keyed subject, so one inspector draws every kind. */
import { ROW_KINDS } from '../../kinds/data/rowKinds';
import type { RowKindSpec } from '../../@types/kinds/RowKindSpec';
import type { RowKind } from '../../@types/rows/RowKind';
import type { InspectorSubject } from '../../@types/rows/InspectorSubject';

// The registry is a union of specs over different subjects; the row's kind and its subject always
// agree (both come from the same draft node), which the compiler cannot follow.
export const inspectorSpec = (kind: RowKind): RowKindSpec<InspectorSubject> =>
  ROW_KINDS[kind] as unknown as RowKindSpec<InspectorSubject>;
