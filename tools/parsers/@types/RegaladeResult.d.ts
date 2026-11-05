import type { RegaladeRecord } from './RegaladeRecord';

/** Parsed REGALADE rows plus the count dropped by the skip rules. */
export type RegaladeResult = {
  records: RegaladeRecord[];
  skipped: number;
};
