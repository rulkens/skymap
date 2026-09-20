/** A whole `src/`-relative file `f` whose every one of its `exports` shares the same fate. */
export type FileRef = { readonly f: string; readonly area: string; readonly exports: number };
