/** One raw file or folder of `rawDataRegistry.ts` that an entry covers: where it lies, whether git holds it, and the tool that fetches it. */
export type DataFile = {
  readonly key: string;
  readonly path: string;
  readonly kept: 'committed' | 'gitignored';
  readonly fetcher?: string;
};
