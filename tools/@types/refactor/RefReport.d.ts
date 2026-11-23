import type { RefEntry } from './RefEntry';

export type RefReport = {
  readonly target: string; // the '<file>#<symbol>' address
  readonly refs: readonly RefEntry[]; // every reference except the declaration itself
  readonly fileCount: number; // distinct files in refs
  readonly testCount: number; // refs whose filePath is under tests/
};
