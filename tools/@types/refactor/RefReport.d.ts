import type { RefEntry } from './RefEntry';

export type RefReport<Kind> = {
  readonly target: string; // the '<file>#<symbol>' address
  readonly refs: readonly RefEntry<Kind>[]; // every reference except the declaration itself
  readonly fileCount: number; // distinct files in refs
  readonly testCount: number; // refs with inTest
};
