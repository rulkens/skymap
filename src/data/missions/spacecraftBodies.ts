/**
 * SAMPLED_BODIES — the craft whose position comes from a loaded ephemeris track
 * instead of orbital elements; ids match `trajectoryRegistry` track ids.
 */

export const SAMPLED_BODIES: readonly { readonly id: string }[] = [
  { id: 'voyager1' },
  { id: 'voyager2' },
];
