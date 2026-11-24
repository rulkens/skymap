import type { Engine } from '../../@types/refactor/Engine';
import type { Flags } from './Flags';

export type RunInput<Address, Found> = {
  readonly engine: Engine;
  readonly read: (file: string) => string; // overlay first, then disk
  readonly exists: (file: string) => boolean; // overlay first, then disk
  readonly positionals: readonly string[];
  readonly flags: Flags;
  readonly address: Address; // file in the disk's real case, root-relative
  readonly found: Found; // the one engine query of this op
};
