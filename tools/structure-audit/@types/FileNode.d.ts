/** One `src/` file in the import graph; `code` counts non-blank, non-comment lines. */
export type FileNode = {
  readonly area: string;
  readonly lines: number;
  readonly code: number;
};
