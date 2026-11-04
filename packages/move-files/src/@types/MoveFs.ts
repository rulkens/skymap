/** The disk operations `applyPlan` needs, injectable so write order can be asserted. */
export type MoveFs = {
  readonly readFile: (path: string) => Buffer;
  readonly writeFile: (path: string, data: string) => void;
  readonly mkdirp: (dir: string) => void;
  readonly remove: (path: string) => void;
  readonly rename: (from: string, to: string) => void;
  readonly copyMode: (from: string, to: string) => void;
};
