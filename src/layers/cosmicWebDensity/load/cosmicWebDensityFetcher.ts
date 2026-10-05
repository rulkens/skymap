/**
 * cosmicWebDensityFetcher — one fetcher for every density cube:
 * `<binBaseName>[-<tier>].scfd` under the scalar-field prefix. A 404 surfaces
 * as a commit that never fires, so a missing optional cube draws nothing.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { CosmicWebDensityReq } from '../@types/CosmicWebDensityReq';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

export const cosmicWebDensityFetcher: Fetcher<ScalarCube, CosmicWebDensityReq> = async (
  req,
  signal,
  onProgress,
) => {
  const stem = req.tier === undefined ? req.binBaseName : `${req.binBaseName}-${req.tier}`;
  const buf = await fetchWithProgress(
    dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/${stem}.scfd`),
    signal,
    onProgress,
  );
  return decodeScalarField(buf);
};
