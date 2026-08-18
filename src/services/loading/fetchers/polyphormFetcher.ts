/**
 * polyphormFetcher — Fetcher<ScalarCube, PolyphormReq>.
 *
 * Tier-aware filename: `polyphorm-2mrs-{small,medium,large}.scfd`. Mirrors
 * mcpmFetcher's `{ tier }` request shape — same physical quantity, same
 * per-tier reload semantics.
 *
 * On 404 the slot machinery's error path leaves the field unregistered;
 * the Volumes panel simply doesn't show "Polyphorm (2MRS)".
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { PolyphormReq } from '../../../@types/loading/PolyphormReq';
import type { ScalarCube } from '../../../@types/data/volume/ScalarCube';
import type { Tier } from '../../../@types/data/Tier';
import {
  decodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../../data/volume/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

const FILENAME: Record<Tier, string> = {
  small: `${SCALAR_FIELD_DATA_PREFIX}/polyphorm-2mrs-small.scfd`,
  medium: `${SCALAR_FIELD_DATA_PREFIX}/polyphorm-2mrs-medium.scfd`,
  large: `${SCALAR_FIELD_DATA_PREFIX}/polyphorm-2mrs-large.scfd`,
};

export const polyphormFetcher: Fetcher<ScalarCube, PolyphormReq> = async (
  req,
  signal,
  onProgress,
) => {
  const buf = await fetchWithProgress(dataUrl(FILENAME[req.tier]), signal, onProgress);
  return decodeScalarField(buf);
};
