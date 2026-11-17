import type { SourceEntry } from './SourceEntry';

/** A Layer's rows folded into an id-keyed record. */
export type SourceRecordOf<Rows extends readonly SourceEntry[]> = {
  readonly [E in Rows[number] as E['id']]: E;
};
