/**
 * polyphormFetcher — `Fetcher<ScalarCube, void>` against the prebuilt
 * `polyphorm.scfd` on R2 (or `public/data/` in local dev).
 *
 * Mirrors `cf4DensityFetcher`'s shape: one URL, no per-request branching,
 * decode via the format module. The request payload is `void` — there is
 * one and only one Polyphorm cube; tier doesn't apply (volume rendering
 * isn't tier-gated), so a request type would be vestigial.
 *
 * On 404 the slot machinery's error path leaves the field unregistered;
 * the Volumes panel simply doesn't show "Polyphorm (2MRS)".
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const polyphormFetcher: Fetcher<ScalarCube, void> = async (_req, signal, onProgress) => {
  const buf = await fetchWithProgress(
    dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/polyphorm.scfd`),
    signal,
    onProgress,
  );
  return decodeScalarField(buf);
};
