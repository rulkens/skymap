/** A relative import `from → to` (both `src/`-relative); `typeOnly` when written `import type`. */
export type ImportEdge = {
  readonly from: string;
  readonly to: string;
  readonly typeOnly: boolean;
};
