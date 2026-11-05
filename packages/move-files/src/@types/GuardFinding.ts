export type GuardFinding = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly reason: 'no-longer-resolves' | 'now-resolves-elsewhere' | 'mentions-old-path';
};
