import type { LiveFile } from './LiveFile';

/** One nightly-built dataset. */
export type LiveDataset = {
  /** R2 folder name. */
  id: string;
  /** npm script that writes the live layout under public/data and exits non-zero on bad data. */
  build: string;
  files: readonly LiveFile[];
  timeoutMin: number;
};
