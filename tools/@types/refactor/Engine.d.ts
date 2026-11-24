/** Opaque outside tools/utils/refactor/engine/: `handle` holds the native API. */
export type Engine = {
  readonly root: string;
  readonly overlay: Map<string, string>; // absolute path → text that shadows the disk
  readonly removed: Set<string>; // absolute paths that no longer exist, whatever the disk says
  readonly handle: unknown;
};
