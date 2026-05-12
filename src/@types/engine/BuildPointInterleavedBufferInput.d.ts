import type { PointCloud } from '../data/PointCloud';
import type { Source } from '../../data/sources';
import type { BuildPointInterleavedBufferMode } from './BuildPointInterleavedBufferMode';

export type BuildPointInterleavedBufferInput = {
  /** The point cloud to bake.  Travels by structured clone (see module doc). */
  cloud: PointCloud;
  /** Which survey this cloud belongs to — drives flux limit, Schechter triple, etc. */
  source: Source;
  /**
   * Whether to compute the per-galaxy Schechter ratios as part of this bake.
   * Defaults to `'fast'` (slot 10 = 1.0).  See `BuildPointInterleavedBufferMode`
   * for the trade-off.  Optional so existing callers (and the worker
   * structured-clone roundtrip) keep working without recompilation.
   */
  mode?: BuildPointInterleavedBufferMode;
};
