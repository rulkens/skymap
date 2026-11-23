export type RefEntry<Kind> = {
  readonly filePath: string; // root-relative
  readonly line: number;
  readonly column: number;
  readonly kind: Kind;
  readonly inTest: boolean; // under tests/ or packages/*/tests/; the kind stays real
  readonly enclosing: string; // e.g. 'function frameTick' or '<module>'
};
