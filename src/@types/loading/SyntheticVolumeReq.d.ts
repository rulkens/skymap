import type { SyntheticVolumeShape } from './SyntheticVolumeShape';

/**
 * Request shape for the synthetic volume fetcher.
 *
 * `handle` is a caller-chosen identifier surfaced in `LoadingDevPanel`
 * (it mirrors the `name` shown in the slot registry row).  `shape`
 * picks which procedural generator to call.  `dims` and `boxSizeMpc`
 * pass through to the generators; both have reasonable defaults so
 * call sites that only care about "any cube" don't need to specify
 * them.
 */
export type SyntheticVolumeReq = {
  /** Caller-chosen identifier; surfaced in `LoadingDevPanel`. */
  handle: string;
  /** Which shape to build.  Default `'gaussian'` for back-compat with
   *  callers from before the multi-shape extension. */
  shape?: SyntheticVolumeShape;
  /** Cube edge length in voxels.  Default 64 (matches generator default). */
  dims?: number;
  /** Physical edge length in Mpc.  Default 400 (matches generator default). */
  boxSizeMpc?: number;
};
