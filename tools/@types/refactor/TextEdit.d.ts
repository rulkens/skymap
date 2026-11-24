export type TextEdit = {
  readonly file: string; // absolute path, real case
  readonly start: number; // UTF-16 offset
  readonly end: number;
  readonly text: string;
};
