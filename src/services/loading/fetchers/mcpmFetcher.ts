/**
 * mcpmFetcher — Fetcher<ScalarCube, MCPMReq>.
 *
 * Tier-aware filename: `mcpm-{small,medium,large}.scfd`. Mirrors
 * filamentFetcher's `{ tier }` request shape. Unlike filaments
 * (which never reload on tier flip — the topology barely differs),
 * MCPM IS tier-reloaded — the resolution change is the user-visible
 * point of the tier dropdown for this overlay, and a lower-tier
 * .scfd is small enough that the bandwidth tradeoff inverts vs
 * filaments.
 *
 * On 404 the slot machinery's error path leaves the field
 * unregistered; the Volumes panel simply doesn't show "MCPM Cosmic
 * Web". Mirrors the cf4DensityFetcher fallback.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { MCPMReq } from '../../../@types/loading/MCPMReq';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { Tier } from '../../../@types/data/Tier';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

const FILENAME: Record<Tier, string> = {
  small: `${SCALAR_FIELD_DATA_PREFIX}/mcpm-small.scfd`,
  medium: `${SCALAR_FIELD_DATA_PREFIX}/mcpm-medium.scfd`,
  large: `${SCALAR_FIELD_DATA_PREFIX}/mcpm-large.scfd`,
};

export const mcpmFetcher: Fetcher<ScalarCube, MCPMReq> = async (req, signal, onProgress) => {
  const buf = await fetchWithProgress(dataUrl(FILENAME[req.tier]), signal, onProgress);
  return decodeScalarField(buf);
};
