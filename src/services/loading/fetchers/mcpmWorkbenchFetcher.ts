/**
 * mcpmWorkbenchFetcher — `Fetcher<ScalarCube, void>` against the promoted
 * `mcpm-workbench.scfd` on R2 (or `public/data/` in local dev).
 *
 * Mirrors `cf4DensityFetcher`'s shape: one URL, void request — the
 * workbench promotes one cube at a time (`tools/volumes/promoteWorkbenchExport.ts`
 * overwrites the single filename), so tier doesn't apply.
 *
 * On 404 the slot machinery's error path leaves the field unregistered;
 * the Volumes panel simply doesn't show it — moot while the entry ships
 * `visible: false`.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const mcpmWorkbenchFetcher: Fetcher<ScalarCube, void> = async (_req, signal, onProgress) => {
  const buf = await fetchWithProgress(
    dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/mcpm-workbench.scfd`),
    signal,
    onProgress,
  );
  return decodeScalarField(buf);
};
