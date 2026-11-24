export type PropAddress = {
  readonly file: string; // path as given (relative or absolute)
  readonly typeName: string; // exported type or interface
  readonly prop: string; // a direct member of it
};
