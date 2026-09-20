import type { Clone } from './Clone';

/** One jscpd run at one threshold; `duplicatedLines / totalLines` is the page's duplication ratio. */
export type CloneReport = {
  readonly clones: readonly Clone[];
  readonly duplicatedLines: number;
  readonly totalLines: number;
};
