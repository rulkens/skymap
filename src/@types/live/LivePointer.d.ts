/** The small mutable JSON that names a live dataset's newest files; `files` maps name to a data-relative key. */
export type LivePointer = {
  date: string;
  builtAt: string;
  files: Readonly<Record<string, string>>;
};
