/**
 * MissionTrailsSettings — the sampled craft's trail overlay, independent of
 * `orbitTrails`. Off by default; a timeline exhibit forces it on and the
 * takeover bracket restores it on exit.
 */

export type MissionTrailsSettings = {
  enabled: boolean;
};
