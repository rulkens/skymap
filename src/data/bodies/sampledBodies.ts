/**
 * SAMPLED_BODIES — the craft whose position comes from a loaded ephemeris track
 * instead of orbital elements; ids match `trajectoryRegistry` track ids.
 * `trailColor` is the craft's trail tint (linear HDR), the one source for it.
 */

import type { SampledBody } from '../../@types/missions/SampledBody';
import { LAYER_BODY_ROWS } from '../../compositions/appBodies';

export const SAMPLED_BODIES: readonly SampledBody[] = LAYER_BODY_ROWS.flatMap((row) =>
  row.position.kind === 'sampled' ? [row.position.sampled] : [],
);
