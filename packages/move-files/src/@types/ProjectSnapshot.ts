export type ProjectSnapshot = {
  readonly texts: ReadonlyMap<string, string>; // absolute path -> text; TS, CSS, .astro, .mdx
  readonly fileExists: (path: string) => boolean; // assets and ignored files
};
