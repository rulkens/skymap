export type Clone = {
  readonly a: string;
  readonly la: number;
  readonly b: string;
  readonly lb: number;
  readonly lines: number;
  readonly tokens: number;
  readonly areaA: string;
  readonly areaB: string;
  readonly sample: string;
};

export type CloneReport = {
  readonly clones: readonly Clone[];
  readonly duplicatedLines: number;
  readonly totalLines: number;
};
