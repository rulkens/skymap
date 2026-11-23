import type { Engine } from '../../@types/refactor/Engine';
import type { Flags } from './Flags';

export type RunInput = {
  readonly engine: Engine;
  readonly read: (file: string) => string; // overlay first, then disk
  readonly positionals: readonly string[];
  readonly flags: Flags;
};
