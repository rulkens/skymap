export type ExportRef = { readonly f: string; readonly name: string; readonly area: string };
export type FileRef = { readonly f: string; readonly area: string; readonly exports: number };

/** Exports nothing in `src/` imports: `dead` = nowhere at all, `testOnly` = only tests/ or tools/. */
export type DeadExportAudit = {
  readonly dead: readonly ExportRef[];
  readonly testOnly: readonly ExportRef[];
  readonly deadFiles: readonly FileRef[];
  readonly testOnlyFiles: readonly FileRef[];
};
