import type { PickStructureStore } from './data/PickStructureStore';

/**
 * Everything `resolvePick` needs to turn a raw GPU pick into a `SelectionRef`.
 * The galaxy arm is purely positional (source code + localIdx), so the cloud
 * accessor is no longer required here — identity is committed first; display
 * resolution happens in the reconciler. Only the structure arm still reads
 * store data (to recover the durable `id` from the pick index), so the dep
 * bag shrinks to a single field.
 */
export type ResolvePickDeps = {
  readonly structures: PickStructureStore;
};
