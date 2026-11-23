/** Opaque outside tools/utils/refactor/engine/: `handle` holds the native API. */
export type Engine = {
  readonly root: string;
  readonly overlay: Map<string, string>; // absolute path → text that shadows the disk
  readonly handle: unknown;
};
