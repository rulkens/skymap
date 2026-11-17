export type CompanionRule = {
  readonly from: string; // root prefix; '' matches anywhere
  readonly to: string;
  readonly sources: readonly string[]; // extensions of the primary
  readonly suffixes: readonly string[]; // replace the primary's extension
};
