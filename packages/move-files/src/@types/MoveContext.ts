import type { AliasScope } from './AliasScope';
import type { MoveConfig } from './MoveConfig';

export type MoveContext = {
  readonly root: string;
  readonly config: MoveConfig;
  readonly aliasScopes: readonly AliasScope[];
};
