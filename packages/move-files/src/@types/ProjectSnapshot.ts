/**
 * The project as the core sees it. All paths are absolute. `fileExists` and
 * `directoryExists` ask the disk, which on macOS answers for any case; `listed` holds the
 * exact names git has, so it is what tells `Foo.ts` from `foo.ts` there.
 */
export type ProjectSnapshot = {
  readonly texts: ReadonlyMap<string, string>; // UTF-8 files that can hold a reference
  readonly listed: ReadonlySet<string>;
  readonly fileExists: (path: string) => boolean; // assets and ignored files too
  readonly directoryExists: (path: string) => boolean;
};
