import type { LoadState } from './LoadState';

/**
 * The handle returned by `createAssetSlot`.  This is the public API every
 * consumer of the loading subsystem talks to.
 */
export type AssetSlot<T, Req> = {
  readonly name: string;
  load(req: Req): void;
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
};
