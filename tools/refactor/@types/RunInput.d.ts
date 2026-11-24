import type { Engine } from '../../@types/refactor/Engine';
import type { FoundRefs } from '../../@types/refactor/FoundRefs';
import type { SymbolAddress } from '../../@types/refactor/SymbolAddress';
import type { Flags } from './Flags';

export type RunInput = {
  readonly engine: Engine;
  readonly read: (file: string) => string; // overlay first, then disk
  readonly exists: (file: string) => boolean; // overlay first, then disk
  readonly positionals: readonly string[];
  readonly flags: Flags;
  readonly address: SymbolAddress; // file in the disk's real case, root-relative
  readonly found: FoundRefs; // the one engine query of this op
};
