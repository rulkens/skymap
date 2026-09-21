/** One matrix row/column: an area, its starting tier (`group`) and size in files and code lines. */
export type StructureAuditArea = {
  readonly name: string;
  readonly group: string;
  readonly files: number;
  readonly code: number;
};
