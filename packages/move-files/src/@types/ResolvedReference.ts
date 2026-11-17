import type { AliasRule } from './AliasRule';
import type { ReferenceShape } from './ReferenceShape';

export type ResolvedReference = {
  readonly target: string;
  readonly shape: ReferenceShape;
  readonly query: string; // '?worker' or ''
  readonly alias: AliasRule | null;
};
