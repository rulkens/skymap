import type { RefKind } from './RefKind';

export type RefEntry = {
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly kind: RefKind;
  readonly enclosing: string; // e.g. 'function frameTick' or '<module>'
};
