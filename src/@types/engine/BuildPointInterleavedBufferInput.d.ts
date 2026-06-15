import type { GalaxyCatalog } from '../data/GalaxyCatalog';
import type { SourceType } from '../data/SourceType';
import type { BuildPointInterleavedBufferMode } from './BuildPointInterleavedBufferMode';

export type BuildPointInterleavedBufferInput = {
  /** The galaxy catalog to bake.  Travels by structured clone (see module doc). */
  cloud: GalaxyCatalog;
  /** Which galaxy catalog this catalog belongs to — drives flux limit, Schechter triple, etc. */
  source: SourceType;
  /**
   * Whether to compute the per-galaxy Schechter ratios as part of this bake.
   * Defaults to `'fast'` (slot 9 = 1.0).  See `BuildPointInterleavedBufferMode`
   * for the trade-off.  Optional so existing callers (and the worker
   * structured-clone roundtrip) keep working without recompilation.
   */
  mode?: BuildPointInterleavedBufferMode;
};
