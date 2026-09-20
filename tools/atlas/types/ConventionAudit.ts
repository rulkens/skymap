export type ConventionAudit = {
  readonly interfaces: readonly { f: string; line: number; text: string }[];
  readonly barrels: readonly { f: string; exports: number }[];
  readonly multiExport: readonly { f: string; names: readonly string[] }[];
  readonly inlineTypes: readonly { f: string; names: readonly string[] }[];
};
