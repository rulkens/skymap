export type TileStreamFetchInput<T> = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<T | null>;
  readonly onResult: (payload: T | null) => void;
};
