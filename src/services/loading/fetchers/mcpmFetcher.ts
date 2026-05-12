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
import type { Fetcher } from '../types';
import type { ScalarCube } from '../../../@types/data/ScalarCube';
import type { Tier } from '../../../@types/data/Tier';
import { decodeScalarField } from '../../../data/scalarFieldFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

/** Request shape: tier alone — the cube isn't per-source. */
export type MCPMReq = { tier: Tier };

const FILENAME: Record<Tier, string> = {
  small: 'mcpm-small.scfd',
  medium: 'mcpm-medium.scfd',
  large: 'mcpm-large.scfd',
};

export const mcpmFetcher: Fetcher<ScalarCube, MCPMReq> = async (req, signal, onProgress) => {
  const buf = await fetchWithProgress(dataUrl(FILENAME[req.tier]), signal, onProgress);
  return decodeScalarField(buf);
};
