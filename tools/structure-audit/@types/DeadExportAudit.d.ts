import type { ExportRef } from './ExportRef';
import type { FileRef } from './FileRef';

/** Exports nothing in `src/` imports: `dead` = nowhere at all, `testOnly` = only tests/ or tools/. */
export type DeadExportAudit = {
  readonly dead: readonly ExportRef[];
  readonly testOnly: readonly ExportRef[];
  readonly deadFiles: readonly FileRef[];
  readonly testOnlyFiles: readonly FileRef[];
};
