import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { SourceRecordOf } from '../../@types/data/SourceRecordOf';

// `Object.fromEntries` widens keys to `string`, so the return type comes from
// the rows via the cast, not from inference.
export function sourceRecordOf<const Rows extends readonly SourceEntry[]>(
  rows: Rows,
): SourceRecordOf<Rows> {
  return Object.fromEntries(rows.map((entry) => [entry.id, entry])) as SourceRecordOf<Rows>;
}
