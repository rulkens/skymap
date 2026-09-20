/** One strongly connected component of the file graph (size ≥ 2): its files and the areas they span. */
export type StructureAuditCycle = {
  readonly size: number;
  readonly areas: readonly string[];
  readonly files: readonly string[];
};
