/** CatalogFileProblem — why a loaded file was refused, as shown to the visitor. */
export type CatalogFileProblem = {
  readonly line: number | null; // 1-based; null for whole-file problems
  readonly message: string;
};
