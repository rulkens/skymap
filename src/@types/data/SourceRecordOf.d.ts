import type { SourceType } from './SourceType';
import type { SourceEntry } from './SourceEntry';

/** A `[code, entry]` rows tuple, folded into a code-keyed record. */
export type SourceRecordOf<Rows extends readonly (readonly [SourceType, SourceEntry])[]> = {
  readonly [R in Rows[number] as R[0]]: R[1];
};
