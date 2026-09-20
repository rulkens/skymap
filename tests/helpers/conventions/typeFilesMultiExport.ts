/**
 * `typeFilesAreDeclarations.test.ts`'s debt ledger: `@types/` files exporting
 * more than one type. Built empirically off the current tree — splitting one
 * of these must drop its row in the same change, or the ratchet test fails on
 * the row that no longer violates.
 */
export const TYPE_FILES_MULTI_EXPORT: ReadonlySet<string> = new Set([
  'tools/mcpm-workbench/@types/HistogramSlice.d.ts',
]);
