/**
 * syntheticVolumeFetcher — `Fetcher<ScalarCube, SyntheticVolumeReq>`.
 *
 * Resolves synchronously to a deterministic Gaussian-blob cube produced
 * by `makeSyntheticGaussianCube`.  Routed through the `AssetSlot`
 * machinery so the synthetic cube's lifecycle is identical to a real
 * CF-4 or MCPM cube's: ready/error transitions, race-checked commit,
 * `LoadingDevPanel` row.
 *
 * ### Why this exists
 *
 * Without this fetcher, dev-mode synthetic test data would bypass the
 * slot system, and any future feature that touches the slot machinery
 * (e.g. a "loading volumes…" status indicator, a loading-bar row, or
 * the race-checked commit that prevents tier-swap stomping) would have
 * to be implemented twice — once for real cubes, once for the synthetic
 * smoke-test path.
 *
 * Mirrors the `syntheticPointFetcher` precedent — see that file's
 * docblock for the full rationale.  The only structural difference is
 * that the request shape is volume-specific (`SyntheticVolumeReq`)
 * rather than re-using `PointCloudReq`; this keeps both fetchers'
 * typed request shapes narrow.
 *
 * ### Why the fetcher is dev-only but the module is not
 *
 * The fetcher module is plain TS with no `import.meta.env.DEV` guard —
 * tree-shaking handles removal in production because the only call site
 * (`wireSlots.ts`) is guarded with `import.meta.env.DEV`.  Vite's
 * bundler will not include this module in production bundles if nothing
 * else imports it.  Keeping the guard at the call site (not here) is
 * the same convention `syntheticPointFetcher.ts` uses.
 */

import type { Fetcher } from '../types';
import type { ScalarCube } from '../../../@types/ScalarCube';
import {
  makeSyntheticGaussianCube,
  makeCartesianGridCube,
  makeSphericalGridCube,
} from '../../../data/syntheticScalarField';

/** Which procedural shape to generate.  Discriminator on the request. */
export type SyntheticVolumeShape = 'gaussian' | 'cartesian' | 'spherical';

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

/**
 * Pure synchronous generator wrapped in a promise.  Dispatches on
 * `shape` to one of the three generators in `data/syntheticScalarField`.
 * The `signal` and `onProgress` parameters are accepted (matching the
 * `Fetcher` contract) but unused — there is no I/O to cancel and no
 * byte stream to measure.  Accepting them makes the call site uniform
 * with every other fetcher so `createAssetSlot` can treat this
 * fetcher identically.
 */
export const syntheticVolumeFetcher: Fetcher<ScalarCube, SyntheticVolumeReq> = async (req) => {
  const shape: SyntheticVolumeShape = req.shape ?? 'gaussian';
  switch (shape) {
    case 'gaussian':
      return makeSyntheticGaussianCube({
        dims: req.dims,
        boxSizeMpc: req.boxSizeMpc,
        frameKind: 'equatorial-cartesian',
      });
    case 'cartesian':
      return makeCartesianGridCube({
        dims: req.dims,
        boxSizeMpc: req.boxSizeMpc,
        frameKind: 'equatorial-cartesian',
      });
    case 'spherical':
      return makeSphericalGridCube({
        dims: req.dims,
        boxSizeMpc: req.boxSizeMpc,
        frameKind: 'equatorial-cartesian',
      });
    default: {
      const _exhaustive: never = shape;
      throw new Error(`syntheticVolumeFetcher: unknown shape "${String(_exhaustive)}"`);
    }
  }
};
