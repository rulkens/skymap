/** Another declaration the engine ties to a queried property: it shares the symbol's references. */
export type RelatedDeclaration = {
  readonly file: string; // absolute; a library declaration lives under node_modules
  readonly line: number; // 1-based
  readonly owner: string; // the declaring interface or type alias, '(anonymous type)' if neither
  readonly typeMember: boolean; // a member of an interface or type literal, not a class field or a local
};
