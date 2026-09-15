import type { SourceType } from '../../@types/data/SourceType';
import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { SourceRecordOf } from '../../@types/data/SourceRecordOf';

// `Object.fromEntries` widens keys to `string`, so the return type comes from
// the tuple via the cast, not from inference.
export function sourceRecordOf<const Rows extends readonly (readonly [SourceType, SourceEntry])[]>(
  rows: Rows,
): SourceRecordOf<Rows> {
  return Object.fromEntries(rows) as SourceRecordOf<Rows>;
}
