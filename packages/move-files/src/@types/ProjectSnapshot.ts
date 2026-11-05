/** The project as the core sees it, in absolute paths. On macOS the disk answers for any case. */
export type ProjectSnapshot = {
  readonly texts: ReadonlyMap<string, string>; // UTF-8 files that can hold a reference
  readonly listed: ReadonlySet<string>; // git's exact names: what tells `Foo.ts` from `foo.ts`
  readonly fileExists: (path: string) => boolean; // assets and ignored files too
  readonly directoryExists: (path: string) => boolean;
};
