/** One import or re-export statement as written: its specifier, and whether the whole statement is `type`. */
export type ParsedImport = {
  readonly spec: string;
  readonly typeOnly: boolean;
  /** Imported names; `'*'` for namespace, dynamic and `export *` forms, `'default'` for default. */
  readonly names: readonly string[];
};
