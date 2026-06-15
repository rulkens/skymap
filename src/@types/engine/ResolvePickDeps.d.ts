import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../data/SourceType';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { PickStructureStore } from './data/PickStructureStore';

/**
 * Everything `resolvePick` needs to turn a raw GPU pick into a resolved
 * `FocusableTarget`, supplied as plain functions/values so the resolver stays a
 * pure boundary (no closures over the engine, trivial to stub in tests).
 *
 *   - `getCloud(source)`  — the live cloud for a galaxy-catalog code, or
 *                           `undefined` mid tier-swap (the galaxy arm guards it).
 *   - `getFamousMeta()`   — the famous sidecar that enriches Famous rows.
 *   - `structures`        — the narrowed per-category store the structure arm
 *                           indexes through `resolveStructureFromPick`.
 */
export type ResolvePickDeps = {
  readonly getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  readonly getFamousMeta: () => readonly FamousMetaEntry[];
  readonly structures: PickStructureStore;
};
