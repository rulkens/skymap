/**
 * flowFieldFetcher — `Fetcher<ScalarCube, void>` against the prebuilt
 * `flowfield.scfd` on R2 (or `public/data/` in local dev).
 *
 * Mirrors `cf4DensityFetcher`'s shape: one URL, no per-request branching,
 * decode via the format module. The request payload is `void` — there is
 * one and only one CF4++ velocity cube. Unlike the galaxy catalog catalogs (and
 * unlike MCPM), the flow field is NOT tier-gated: it ships as a single
 * self-describing `.scfd` with no per-tier variants and no JSON sidecar
 * (SCFD v3 folds the frame + velocity stats into the binary header), so a
 * request type would be vestigial.
 *
 * On 404 the slot machinery's error path leaves the layer unloaded; the flow
 * toggle simply has nothing to commit. This mirrors the cf4Density / filament
 * fallback (a missing optional binary disables that layer silently rather than
 * crashing).
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const flowFieldFetcher: Fetcher<ScalarCube, void> = async (_req, signal, onProgress) => {
  const buf = await fetchWithProgress(
    dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/flowfield.scfd`),
    signal,
    onProgress,
  );
  return decodeScalarField(buf);
};
