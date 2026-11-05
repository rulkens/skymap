/** Per area: how many `src/` files have a `tests/` twin at the mirrored path. */
export type TestMirror = {
  readonly area: string;
  readonly files: number;
  readonly tested: number;
  readonly untested: readonly string[];
};
