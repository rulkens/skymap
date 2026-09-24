import type { SourceType } from '../../data/SourceType';

/**
 * One "this source's catalog landed with N rows" report, yielded by
 * `Layer.sourceCounts`. Core owns what the number MEANS (the ready total, the
 * content-version bump); a Layer only says which source reached which count.
 */
export type SourceCountReport = {
  readonly source: SourceType;
  readonly count: number;
};
